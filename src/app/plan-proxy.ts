import { stime, className } from "@thegraid/common-lib";
import { Hex, HexMaps, IHex } from "./hex";
import { IMove, Move } from "./move";
import { Planner } from "./planner";
import { StoneColor, stoneColors, TP } from "./table-params";

export type PlanData = {
  verb: string,
  args: (string | number | boolean | IMove[])[]
}
export type IPlanner = {
  /** enable Planner to continue searching */
  roboMove(run: boolean): void;
  /** provoke Planner to search for next Move */
  makeMove(stoneColor: StoneColor, history: IMove[]): Promise<IHex>;
  /** permanently stop this IPlanner */
  terminate(): void;
}
/**
 * IPlanner factory method.
 * @param hexMap from the main GamePlay, location of Hex for makeMove
 * @param index player.index [0 -> 'b', 1 -> 'w']
 * @returns 
 */
export function
  newPlanner(hexMap: HexMaps, index: number): IPlanner {
  if (TP.pWorker) {
    return new PlannerProxy(hexMap.mh, hexMap.nh, index)
  } else {
    return new Planner(hexMap.mh, hexMap.nh, index)
  }
}
export class PlannerProxy implements IPlanner {
  colorn: string
  worker: Worker 
  get ll0() { return TP.log > 0 }

  constructor(public mh: number, public nh: number, private index: number) {
    let colorn = this.colorn = TP.colorScheme[stoneColors[index]]
    this.ll0 && console.log(stime(this, `(${this.colorn}).newPlannerProxy:`), { mh, nh, index, colorn })
    this.worker = this.makeWorker()
    this.worker['Aname'] = `Worker-${colorn}`
    this.postMessage(`.makeWorker`, 'log', 'made worker for:', this.colorn)
    this.ll0 && console.log(stime(this, `(${this.colorn}).newPlannerProxy:`), { worker: this.worker })
    //setTimeout(() => {this.initiate()})
    this.initiate()
  }
  // async to enable debug step-into
  makeWorker() {
    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('./plan.worker', import.meta.url));
      worker.onmessage = (msg) => { this.onMessage(msg) }
      worker.onerror = (err) => { this.onError(err) }
      return worker
    } else {
      // Web Workers are not supported in this environment.
      alert(`ProxyPlanner: Worker not defined!`) // TODO: fallback to non-proxy Planner...
      debugger; // Worker not defined
    }
    return undefined
  }
  initiate() {
    this.ll0 && console.log(stime(this, `(${this.colorn}).initiate:`), this.worker)
    this.postMessage(`.initiate-new:`, 'newPlanner', this.mh, this.nh, this.index)
    this.postMessage('.initiate-log:', 'log', `initiate:`, this.colorn, this.index);
    this.postMessage(`.initiate-set:`, 'setParam', 'TP', 'yieldMM', 500); TP.yieldMM // TP.yieldMM = 300
  }

  terminate() {
    this.ll0 && console.log(stime(this, `.terminate:`), this.worker)
    this.postMessage(`.terminate:`, 'terminate')
    setTimeout(() => this.worker.terminate())
  }

  roboMove(run: boolean) {
    this.ll0 && console.log(stime(this, `(${this.colorn}).roboMove: run =`), run)
    this.postMessage(`.roboMove:`, 'roboMove', run)
  }
  setParam(target: object, fieldName: string, value: (string | number | boolean)) {
    let targetName = target['name'] || className(target)
    this.ll0 && console.log(stime(this, `(${this.colorn}).setParam:`), {targetName, fieldName, value})
    this.postMessage(`.setParam`, 'setParam', targetName, fieldName, value)
  }

  filHex: (hex: IHex) => void
  rejHex: (arg: any) => void
  makeMove(stoneColor: StoneColor, history: Move[]): Promise<IHex> {
    let iHistory = history.map((m) => m.toIMove)
    // TODO: marshal iHistory to a [Transferable] bytebuffer [protobuf?]
    this.ll0 && console.log(stime(this, `(${stoneColor}).makeMove: iHistory =`), iHistory)
    this.postMessage(`.makeMove:`, 'makeMove', stoneColor, iHistory )
    return new Promise<IHex>((fil, rej) => {
      this.filHex = fil
      this.rejHex = rej
    })
  }

  parseMessage(data: PlanData) {
    this.ll0 && console.log(stime(this, `.parseMessage:`), data)
    let { verb, args } = data
    switch (verb) {
      case 'ready':
        break;
      case 'move':
        let [row, col, Aname] = args as [number, number, string]
        let ihex = {row, col, Aname}
        this.ll0 && console.log(this, `.move:`, ihex)
        this.filHex(ihex)
        break;
    }
  }  

  onMessage(msg: MessageEvent<PlanData>) {
    this.parseMessage(msg.data)
  }
  onError(err: ErrorEvent) {
    console.error(stime(this, `.onError:`), err)
  }

  // postMessage(message: any, transfer: Transferable[]): void;
  // postMessage(message: any, options?: StructuredSerializeOptions): void;
  async postMessage(ident: string, verb: string, ...args: (string | number | boolean | IMove[] | (string|number|boolean)[])[]) {
    let data = {verb, args}
    this.ll0 && console.log(stime(this, `(${this.colorn})${ident} Post:`), {verb: data.verb}, data.args)
    this.worker.postMessage(data)
  }
}

import { EzPromise } from "@thegraid/ezpromise"

//// We think we need to manage the messages round-trip; so we don't overdrive the client.
//// currently: only happens for newPlanner->initiate; because plannerMove has plannerRunning = true
//// CityMap contributes sendAndRecv() which it uses to handle similar init/join situation.
/* 
cmClient.sendAndReceive(() => cmClient.send_join(name), (msg) => {
        return msg.type == CmType.join && msg.name == name
      }).then(replyMsg => {...})
*/

//// wspbclient.CgBase has the code for queueing promiseOfAck
//// message.expectsAck && !this.ack_resolved

declare type DataBuf<T> = Uint8Array;
class CgMessage {
  success: boolean
  cause: string
  cgType: string
  expectsAck(): boolean { return true}
}
class CmMessage  { 
  static deserialize(ev: DataBuf<CmMessage>) {
    return new CmMessage()
  }
}
export declare class AckPromise extends EzPromise<CgMessage> {
  message: CgMessage;
  constructor(message: CgMessage, def?: (fil: (value: CgMessage | PromiseLike<CgMessage>) => void, rej: (reason?: any) => void) => void);
}
type EventSource = {
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
}
class FlowControl {
  eventSource: EventSource
  // this may be tricky... need to block non-ack from any client with outstanding ack
  // (send them an immediate nak) in CgServerDriver
  /** 
   * Promise for last outbound message that expects an Ack.
   * private, but .resolved and .message are accessible:  
   */
   private promise_of_ack: AckPromise = new AckPromise(new CgMessage()).fulfill(null);
   get ack_promise(): AckPromise { return this.promise_of_ack } // read-only for debugging CgServerDriver
   /** true if last outbound request has been Ack'd */
   get ack_resolved(): boolean { return this.promise_of_ack.resolved }
   get ack_message(): CgMessage { return this.promise_of_ack.message }
   get ack_message_type(): string { return this.promise_of_ack.message.cgType }
  sendToSocket(message: CgMessage, ackPromise: AckPromise = new AckPromise(message)): AckPromise {
    if ((message.expectsAck() && !this.ack_resolved)) {
      // queue this message for sending when current message is ack'd:
      //this.log && console.log(stime(this, `.sendToSocket[${this.client_id}] defer=`), { msgStr: this.innerMessageString(message), resolved: this.ack_resolved })
      this.ack_promise.then((ack) => {
        //this.log && console.log(stime(this, `.sendToSocket[${this.client_id}] refer=`), { msgStr: this.innerMessageString(ack) })
        this.sendToSocket(message, ackPromise) //.then((ack) => ackPromise.fulfill(ack))
      })
      return ackPromise  // with message un-sent
    }
    return undefined
  }
  /** 
   * Send CmMessage, get Ack, then wait for a CmMessage that matches predicate.
   * @return promise to be fulfill'd by first message matching predicate.
   * @param sendMessage function [thunk] to send a message and return an AckPromise
   * @param pred a predicate to recognise the CmMessage response (and fullfil promise)
   */
   sendAndReceive(sendMessage: () => AckPromise, pred: (msg: CmMessage) => boolean = (msg: CmMessage): boolean => true): EzPromise<CmMessage> {
    let listenForCmReply =  (ev: MessageEvent<DataBuf<CmMessage>>) => {
      let cmm = CmMessage.deserialize(ev.data)
      if (pred(cmm)) {
        console.log(stime(this, ".listenForCmReply: fulfill="), cmm)
        this.eventSource.removeEventListener('message', listenForCmReply)
        cmPromise.fulfill(cmm)
      }
    }
    let cmPromise = new EzPromise<CmMessage>()
    this.eventSource.addEventListener('message', listenForCmReply)
    let ackPromise = sendMessage()
    ackPromise.then((ack) => {
      if (!ack.success) { 
        this.eventSource.removeEventListener('message', listenForCmReply)
        cmPromise.reject(ack.cause) 
      }
    })
    return cmPromise
  }
}
