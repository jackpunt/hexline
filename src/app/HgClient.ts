import { stime } from '@thegraid/common-lib';
import { ParamLine } from '@thegraid/easeljs-lib';
import { CgBase, CgMessage, GgClient, GgRefMixin, LeaveEvent, WebSocketBase } from '@thegraid/wspbclient';
import { GamePlay } from './game-play';
import { HgMessage, HgType } from './HgMessage';
import { Player } from './player';
import { TP } from './table-params';

/**
 * TODO: make CgBaseRefMixin ??
 */
class CgBaseForRef extends CgBase<HgMessage> {
  /** eval_leave() when a Client has left the Group. */
  override eval_leave(message: CgMessage) {
    console.log(stime(this, ` CgBaseForRef.eval_leave: received message`), message)
    console.log(stime(this, ` CgBaseForRef.eval_leave: ack_promise`), this.ack_promise, this.ack_message)

    setTimeout(() => {
      // NEXT TICK! allow ourselves to process the inbound Ack(send_done) from last roster send
      super.eval_leave(message) // log; maybe closeStream('toldToLeave')
      // dispatch a 'leave' event to inform upstream driver; leaveGroup --> leaveGame (or whatever)
      // see also: CgServerDriver where ServerSocketDriver('close') --> send(CgMessage(CgType.leave))
      // [which is what we are processing here]
      let { type, client_id, cause, group, nocc } = message
      let event = new LeaveEvent(client_id, cause, group)
      console.log(stime(this, ` CgBaseForRef.eval_leave: dispatching event`), event)
      this.dispatchEvent(event)
    }, 4);
  }
  /** override to log while debugging */
  override eval_ack(message: CgMessage, req: CgMessage): void {
    console.log(stime(this, ` CgBaseForRef.eval_ack:`), { message, req })
    //super.eval_ack(message, req) // super does nothing
  }
}
class CgBaseForHgClient extends CgBase<HgMessage> {

}
export class HgClient extends GgClient<HgMessage> {
  static maxPlayers = 2      // settable...
  override maxPlayers: number = HgClient.maxPlayers       // determines hgClient.isPlayer
  /**
   * supply third arg to change CgBase driver.
   * @param url 
   * @param onOpen 
   * @param CgB optional CgBase constructor: CgBaseForHgClient
   */
  constructor(url?: string, onOpen?: (hgClient: HgClient) => void, CgB = CgBaseForHgClient) {
    super(HgMessage, CgB, WebSocketBase, url, onOpen)
    this.deserialize = (buf: Uint8Array) => { return HgMessage.deserialize(buf) }
  }
  override deserialize: (buf: Uint8Array) => HgMessage;
  /** for dnstream to logData(message.msg: HgMessage) */
  // override msgToString(msg: HgMessage) {
  //   return msg.msgString
  // }
  player: Player // could also move 'player' slot to GamePlay [which also holds hgClient]
  gamePlay: GamePlay
  override parseEval(message: HgMessage) {
    let type = message.type
    switch (type) {
      case HgType.hg_none: this.eval_none(message); break
      case HgType.hg_chat: this.eval_chat(message); break
      case HgType.hg_join: this.eval_join(message); break
      case HgType.hg_undo: this.eval_undo(message); break
      case HgType.hg_next: this.eval_next(message); break
      case HgType.hg_makeMove: this.eval_makeMove(message);break
      case HgType.hg_sendMove: this.eval_sendMove(message); break
      case HgType.hg_progress: break
      case HgType.hg_setParam: break
      default: {
        // if subclass does not override, still try to invoke their method!
        ; (this[`eval_${message.msgType}`] as Function).call(this, message)
      }
    }
    // if not already ACK'd:
    if (!this.message_to_ack.resolved) {
      this.ll(1) && console.log(stime(this, `.parseEval: sendCgAck('${message.msgType}') for message`), message)
      this.sendCgAck(message.msgType)
    }
  }
  override eval_join(message: HgMessage) {
    console.log(stime(this, `.eval_joinGame:`), { message })
    super.eval_join(message)
  }
  /** Not much use for GgType.next; HgType.hg_makeMove does the turn */
  override eval_next(message: HgMessage) {
    //super.eval_next()
    //console.log(stime(this, `.eval_next: after doPlayerMove - setNextPlayer =`), this.gamePlay.curPlayer.color)
  }
  /** indicates it is my turn to find the next Move. */
  eval_makeMove(message: HgMessage) {
    this.gamePlay.setNextPlayer(this.player)
    this.gamePlay.makeMove()  // move by gamePlay.curPlayer
  }
  /** indicates curPlayer has sent their next Move */
  eval_sendMove(message: HgMessage) {
    this.gamePlay.remoteMoveEvent(message)
    //this.sendCgAck('move made')
  }
  eval_progress(message: HgMessage) {
  }
  eval_setParam(message: HgMessage) {
    let { targetName, fieldName, value } = JSON.parse(message.json)
    if (HgClient.paramNames.includes(fieldName) && targetName == 'TP') {
      let line: ParamLine
      let setup = this.player?.table.gamePlay.gameSetup
      let gui = setup?.paramGUIs.find(gui => (line = gui.findLine(fieldName)))
      if (gui) {
        gui.selectValue(fieldName, value, line)
      }
      if (targetName === 'TP') TP[fieldName] = value
    }
  }
  static paramNames = ['nHexes', 'mHexes', 'allowSacrifice']; refs = [TP.mHexes, TP.nHexes, TP.allowSacrifice]
}
export class HgReferee extends GgRefMixin<HgMessage, typeof HgClient>(HgClient) {
  cgBaseType = CgBase
  constructor(url?: string, onOpen?: ((ggClient: GgClient<HgMessage>) => void), cgBaseC = CgBaseForRef) {
    super(url, (ggC) => {
      onOpen(ggC)
      this.log = 1
      this.cgbase.log = 1
      this.wsbase.log = 1
      this.cgbase.addEventListener('leave', (ev) => {
        this.client_leave(ev as unknown as LeaveEvent) // handled in GgRefMixin.RefereeBase
    })
    }, cgBaseC as typeof CgBase);
    this.cgBaseType = cgBaseC as typeof CgBase
  }

  /** indicates curPlayer has sent their next Move */
  override eval_sendMove(message: HgMessage) {
    super.eval_sendMove(message)  // localMakeMove & then send it:
    let { client_from, type } = message // type = HgType.hg_sendMove
    this.sendCgAck('move accepted', { client_id: client_from })
    let outmsg = new HgMessage({ type, json: message.json, inform: message.inform })
    this.send_message(outmsg, { client_id: CgMessage.GROUP_ID, nocc: true, client_from })
  }
}
