import { stime, AT, json } from "@thegraid/common-lib";
import { HexMaps, IHex } from "./hex";
import { IMove } from "./move";
import { Planner } from "./planner";
import { StoneColor, stoneColors, TP } from "./table-params";
import { ILogWriter } from "./stream-writer";

import { EzPromise } from "@thegraid/ezpromise" // for FlowControl
import { Progress } from "./game-play";

export type ParamSet = [string, string, MsgSimple]
export type MsgSimple = string | number | boolean
export type MsgArgs = (MsgSimple | IMove[] | ParamSet) // PlanData['args']
export type ReplyArgs = (MsgSimple | IHex | Progress) // PlanData['args']
export type MsgKey = keyof IPlanMsg
export type ReplyKey = keyof IPlanReply

export type PlanData = {
  verb: MsgKey,
  args: MsgArgs[]
}
export type ReplyData = {
  verb: ReplyKey
  args: ReplyArgs[]
}
/** Local/Direct methods of Planner */
export interface IPlanner extends IPlannerMethods {
  waitPaused(ident?: string): Promise<void>
}

/** Local & Remote methods of Planner */
interface IPlannerMethods {
  pause(): void
  resume():void
  /** enable Planner to continue/stop searching */
  roboMove(run: boolean): void;
  /** provoke Planner to search for next Move */
  makeMove(stoneColor: StoneColor, history: IMove[], incb?: number): Promise<IHex>;
  /** permanently stop this IPlanner */
  terminate(): void;
}

/**
 * Remote/Worker message methods of PlanWorker
 */
export interface IPlanMsg extends IPlannerMethods {
  newPlanner(mh: number, nh: number, index: number): void
  log(...args: MsgArgs[]): void
  setParam(...args: ParamSet): void
}
/** PlanProxy implements IPlanReply message methods: */
export type IPlanReply = {
  newDone(args: MsgArgs[]): void
  sendMove(ihex: IHex): void
  logFile(file: string, text: string): void
  progress(pv: Progress): void
  terminateDone(): void
}
/** Message Keys; methods of IPlanMsg/IPlanner or IPlanReply */
export class MK {
  static roboMove: MsgKey = 'roboMove'
  static makeMove: MsgKey = 'makeMove'
  static terminate: MsgKey = 'terminate'
  static pause: MsgKey = 'pause'
  static resume: MsgKey = 'resume'

  static log: MsgKey = 'log'
  static newPlanner: MsgKey = 'newPlanner'
  static setParam: MsgKey = 'setParam'

  static newDone: ReplyKey = 'newDone'
  static sendMove: ReplyKey = 'sendMove'
  static logFile: ReplyKey = 'logFile'
  static progress: ReplyKey = 'progress'
  static terminateDone: ReplyKey = 'terminateDone'
}

/**
 * IPlanner factory method, invoked from Player.newGame()
 * @param hexMap from the main GamePlay, location of Hex for makeMove
 * @param index player.index [0 -> 'b', 1 -> 'w']
 * @returns Planner or PlannerProxy 
 */
export function newPlanner(hexMap: HexMaps, index: number, logWriter: ILogWriter): IPlanner {
  let planner = TP.pWorker
    ? new PlannerProxy(hexMap.mh, hexMap.nh, index, logWriter)    // -> Remote Planner [no Parallel]
    : new Planner(hexMap.mh, hexMap.nh, index, logWriter) // -> Local ParallelPlanner *or* Planner
  return planner
}

/** Each PlannerProxy is bound to a Worker; the Worker make newPlanner -> Planner (or ParrellelPlanner)  */
export class PlannerProxy implements IPlanner, IPlanReply {
  static id = 0
  id = ++PlannerProxy.id
  colorn: string
  worker: Worker 
  get ll0() { return TP.log > 0 }
  get ll1() { return TP.log > 1 }

  constructor(public mh: number, public nh: number, public index: number, public logWriter: ILogWriter) {
    let colorn = this.colorn = TP.colorScheme[stoneColors[index]] || `SC-${index}`
    this.ll0 && console.log(stime(this, `(${this.colorn}).newPlannerProxy:`), { mh, nh, index, colorn })
    this.worker = this.makeWorker()
    this.worker['Aname'] = `Worker-${colorn}`
    this.ll1 && this.postMessage(`.makeWorker`, MK.log, 'made worker for:', this.colorn)
    this.ll0 && console.log(stime(this, `(${this.colorn}#${this.id}).newPlannerProxy:`), { worker: this.worker })
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
  onMessage(msg: MessageEvent<ReplyData>) {
    this.parseMessage(msg.data)
  }
  onError(err: ErrorEvent) {
    console.error(stime(this, `.onError:`), err)
  }
  initiate() {
    this.ll0 && console.log(stime(this, `(${this.colorn}).initiate:`), this.worker)
    this.postMessage(`.initiate-set:`, MK.setParam, 'TP', 'log', TP.log) // so newPlanner can log
    this.postMessage(`.initiate-set:`, MK.setParam, 'TP', 'pPlaner', TP.pPlaner)
    this.postMessage(`.initiate-new:`, MK.newPlanner, this.mh, this.nh, this.index)
    this.ll1 && this.postMessage('.initiate-log:', MK.log, `initiated:`, this.colorn, this.index);
    this.postMessage(`.initiate-set:`, MK.setParam, 'TP', 'yieldMM', 500); TP.yieldMM // TP.yieldMM = 300
  }
  waitForAck: EzPromise<void> = new EzPromise<void>().fulfill()
  terminate() {
    let ident = `.(#${this.id})${MK.terminate}:`
    this.ll0 && console.log(stime(this, ident), this.worker)
    this.postMessage(ident, MK.terminate)
    this.waitForAck = new EzPromise<void>()
  }
  terminateDone(): void {
    MK.terminateDone; this.worker.terminate()
    this.waitForAck.fulfill()
  }
  pauseP = new EzPromise<void>().fulfill()
  pause0() { if (this.pauseP.resolved) this.pauseP = new EzPromise() }
  resume0() { this.pauseP.fulfill() }
  async waitPaused(ident?: string) {
    if (!this.pauseP.resolved) {
      console.log(stime(this, `.waitPaused: ${ident} waiting...`))
      await this.pauseP
    }
  }
  pause() { this.postMessage(`.pause`, MK.pause); this.pause0() }
  resume() { this.postMessage(`.resume`, MK.resume); this.resume0() }
  roboMove(run: boolean) {
    this.ll0 && console.log(stime(this, `(${this.colorn}).roboMove: run =`), run)
    this.postMessage(`.roboMove:`, MK.roboMove, run)
  }
  setParam(...args: ParamSet) {
    this.ll0 && console.log(stime(this, `(${this.colorn}#${this.id}).setParam:`), args)
    this.postMessage(`.setParam`, MK.setParam, ...args)
  }
  logHistory(ident: string, iHistory: IMove[]) {
    let l = iHistory.length
    this.ll0 && console.log(stime(this, `${ident}${AT.ansiText(['bold', 'green'], 'history')} =`),
      `${iHistory[0]?.Aname || ''}#${l}`, [iHistory.map((move, n) => `${move.Aname}#${l - n}`)]
    )
  }
  movePromise: EzPromise<IHex>
  makeMove(stoneColor: StoneColor, iHistory: IMove[], incb = 0): Promise<IHex> {
    ///*this.ll0 &&*/ console.log(stime(this, `(${this.colorn}).makeMove: iHistory =`), iHistory)
    this.logHistory(`.makeMove(${this.colorn}#${this.id}) `, iHistory)
    this.postMessage(`.makeMove:`, MK.makeMove, stoneColor, iHistory, incb )
    return this.movePromise = new EzPromise<IHex>()
  }

  parseMessage(data: ReplyData) {
    this.ll1 && console.log(stime(this, `(#${this.id}:${this.index}).parseMessage:`), data)
    let { verb, args } = data
    let func = this[verb]
    if (typeof func !== 'function') {
      console.warn(stime(this, `.parseMsg.ignore: ${verb}`), args)
    } else {
      func.call(this, ...args)
    }
  };

  // reply to newPlanner
  newDone(args: MsgArgs[]) { }
  // reply to makeMove
  sendMove(ihex: IHex) {
      this.ll0 && console.log(stime(this, `.${MK.sendMove}:`), ihex)
    this.movePromise.fulfill(ihex)
  }
  /** writeLine from Worker */
  logFile(text: string) {
    this.logWriter.writeLine(`${text}`) // from worker's logWriter.writeLine()
  }

  progress(pv: Progress) {
    MK.progress; let text = json(pv, false)
    this.logWriter.writeLine(`${text}#*progress*`) // marked *progress*, not a Move
  }

  // postMessage(message: any, transfer: Transferable[]): void;
  // postMessage(message: any, options?: StructuredSerializeOptions): void;
  async postMessage(ident: string, verb: string, ...args: MsgArgs[]) {
    let wait = this.waitForAck.resolved // BUT: we dispose/replace this PlanProxy when we terminate its Worker!
    if (!wait) console.log(stime(this, `.(${this.id})postMessage: waitForAck WAIT`), this.waitForAck.resolved)
    await this.waitForAck
    if (!wait) console.log(stime(this, `.(${this.id})postMessage: waitForAck DONE`), this.waitForAck.resolved)
    let data = {verb, args}
    this.ll0 && console.log(stime(this, `(${this.colorn}#${this.id})${ident} Post:`), {verb: data.verb}, data.args)
    this.worker.postMessage(data)
  }
}

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
