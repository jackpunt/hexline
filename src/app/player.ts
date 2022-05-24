import { stime, S } from "@thegraid/common-lib"
import { EzPromise } from "@thegraid/ezpromise"
import { Mover, GamePlay0, GamePlay } from "./game-play"
import { Hex  } from "./hex"
import { HexEvent } from "./hex-event"
import { IPlanner, PlannerProxy } from "./plan-proxy"
import { Planner } from "./planner"
import { Stone, Table } from "./table"
import { StoneColor, TP } from "./table-params"

export class Player implements Mover {
  name: string
  index: number
  color: StoneColor
  mover: Mover
  otherPlayer: Player
  gamePlay: GamePlay0
  planner: IPlanner
  useRobo: boolean = false
  get colorn() {return TP.colorScheme[this.color]}
 
  constructor(index: number, color: StoneColor, gamePlay: GamePlay0) {
    this.index = index
    this.color = color
    this.name = `Player${index}-${this.colorn}`
    this.gamePlay = gamePlay
  }
  endGame(): void {
    if (this.planner instanceof PlannerProxy) {
      this.planner.terminate()
    }
  }
  newGame(gamePlay: GamePlay) {
    if (this.planner instanceof PlannerProxy) {
      this.planner.terminate()
    }
    if (TP.pWorker) {
      this.planner = new PlannerProxy(gamePlay, this.index, this.colorn)
    } else {
      this.planner = new Planner(gamePlay.hexMap.mh, gamePlay.hexMap.nh, this.index)
    }
  }
  stopMove() {
    this.planner.roboMove(false)
  }
  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  makeMove(stone: Stone, useRobo = false) {
    let running = this.plannerRunning
    // feedback for KeyMove:
    console.log(stime(this, `(${this.colorn}).makeMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    this.planner.roboMove(true)
    let table = (this.gamePlay instanceof GamePlay) && this.gamePlay.table
    if (useRobo || this.useRobo) {
      // start planner from top of stack:
      setTimeout(() => this.plannerMove(stone, table))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(stone: Stone, table: Table) {
    this.plannerRunning = true
    this.planner.makeMove(stone.color, table.gamePlay.history).then((hex: Hex) => {
      this.plannerRunning = false
      let origMap = table.gamePlay.hexMap
      let hex0 = hex.ofMap(origMap)
      table.hexMap.showMark(hex0)
      table.dispatchEvent(new HexEvent(S.add, hex0, stone))
    })
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

