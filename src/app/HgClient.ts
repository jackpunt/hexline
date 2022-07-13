import { S, stime } from '@thegraid/common-lib';
import { ParamLine } from '@thegraid/easeljs-lib';
import { AckPromise, CgBase, CgMessage, CgMessageOpts, GgClient, GgMessage, GgMessageOptT, GgRefMixin, LeaveEvent, Rost, rost, WebSocketBase } from '@thegraid/wspbclient';
import { GamePlay } from './game-play';
import { Hex } from './hex';
import { HexEvent } from './hex-event';
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
  }
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
  override eval_next(message: HgMessage) {
    //super.eval_next()
    this.gamePlay.setNextPlayer()
  }
  /** indicates it is my turn to find the next Move. */
  eval_makeMove(message: HgMessage) {
    this.gamePlay.setNextPlayer(this.player)
    this.gamePlay.makeMove()  // move by gamePlay.curPlayer
  }
  /** indicates curPlayer has sent their next Move */
  eval_sendMove(message: HgMessage) {
    let map = this.gamePlay.hexMap
    let { sc, iHistory } = JSON.parse(message.json)
    let move = iHistory[0], hex = Hex.ofMap(move.hex, map)
    let hev = new HexEvent(S.add, hex, sc)
    this.gamePlay.localMoveEvent(hev)
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
static paramNames = ['nHexes', 'mHexes', 'allowSuicide']
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
  override joinGroup(url: string, group: string, onOpen: (ggClient: GgClient<HgMessage>) => void, onJoin?: (ack: CgMessage) => void): typeof this {
    // Stack: GgClient=this=GgReferee; CgClient=RefGgBase; WebSocketBase -> url
    this.connectStack(url, (refClient: GgClient<HgMessage>) => {
      onOpen(refClient)
      refClient.cgbase.send_join(group, 0, "referee").then((ack: CgMessage) => {
        this.ll(1) && console.log(stime(this, `.joinGroup: ack =`), ack)
        this.roster.push({ client: ack.client_id, player: this.refid, name: "referee" })
        onJoin && onJoin(ack)
      })
    })
    let dnstream = (this.dnstream as CgBase<GgMessage>) // a [Ref]CgBase
    dnstream.addEventListener('leave', (msg) => this.client_leave(msg))
    console.log(stime(this, `.joinGroup: dnstream =`), dnstream)
    return this
  }
  /** listener for LeaveEvent, from dnstream: CgReferee */
  override client_leave(event: Event | LeaveEvent) {
    let { client_id, cause, group } = event as LeaveEvent
    this.ll(0) && console.log(stime(this, ".client_leave:"), { client_id, cause, group })
    let rindex = this.roster.findIndex(pr => pr.client === client_id)
    let pr: rost = this.roster[rindex]
    // remove from roster, so they can join again! [or maybe just nullify rost.name?]
    if (rindex >= 0) this.roster.splice(rindex, 1)
    this.ll(0) && console.log(stime(this, `.client_leave: ${group}; roster =`), this.roster.concat())
    // tell the other players: send_join(roster)
    this.send_roster(pr, 'leaveGameRoster')  // noting that 'pr' will not appear in roster...
  }
  /** send new/departed player's name, client, player in a 'join' Game message;
   * - all players update their roster using included roster: Rost[]
   * @pr {name, client, player} of the requester/joiner; 
   * @param info CgMessageOpts = { info }
   */
  override send_roster(pr: rost, info = 'joinGameRoster') {
    let { name, client, player } = pr
    let active = this.roster.filter(pr => pr.client != undefined)
    let roster = active.map(pr => new Rost(pr))
    this.send_join(name, { client, player, roster }, { info }) // fromReferee to Group.
  }
  /** send join with roster to everyone. */
  override send_join(name: string, ggOpts: GgMessageOptT = {}, cgOpts: CgMessageOpts = {}): AckPromise {
    let message = this.make_join(name, ggOpts)
    this.ll(1) && console.log(stime(this, ".send_joinGame"), message)
    return this.send_message(message, { client_id: CgMessage.GROUP_ID, nocc: true, ...cgOpts }) // from Referee
    // If HgRef is the only one left, and nocc: true; 
    // So server send_send(roster) distributes it to nobody; sendAck()
  }
  /** indicates curPlayer has sent their next Move */
  override eval_sendMove(message: HgMessage) {
    super.eval_sendMove(message)  // localMakeMove & then send it:
    let { client_from, type } = message
    this.sendCgAck('move accepted', { client_id: client_from })
    let outmsg = new HgMessage({ type })
    outmsg.json = message.json
    this.send_message(outmsg, { client_id: CgMessage.GROUP_ID, nocc: true, client_from })
  }
}
