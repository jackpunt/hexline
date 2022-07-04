import { S } from '@thegraid/common-lib';
import { ParamLine } from '@thegraid/easeljs-lib';
import { addEnumTypeString, CgBase, GgClient, GgRefMixin, pbMessage, stime, WebSocketBase } from '@thegraid/wspbclient';
import { HgMessage, HgType } from 'src/proto/HgProto';
import { GamePlay, GamePlay0 } from './game-play';
import { GameSetup } from './game-setup';
import { Hex } from './hex';
import { HexEvent } from './hex-event';
import { Player } from './player';
import { TP } from './table-params';


/** HgMessage Keys */
type HGMK = Exclude<keyof HgMessage, Partial<keyof pbMessage> | "serialize">
export type HgMessageOpts = Partial<Pick<HgMessage, HGMK>>

declare module '../proto/HgProto' {
  interface HgMessage {
    msgType: string
    client_from: number // GgReferee expects GgMessage to have a slot for client_from
  }
}
/** HgMessage.msgType -> HgType[msg.type]: string (for logging) */
addEnumTypeString(HgMessage, HgType, 'msgType') // define msgType = get HgType(this.type)
export class HgClient extends GgClient<HgMessage> {
  static maxPlayers = 2      // settable...
  override maxPlayers: number = HgClient.maxPlayers       // determines hgClient.isPlayer
  constructor(url?: string, onOpen?: (hgClient: HgClient) => void) {
    super(HgMessage, CgBase, WebSocketBase, url, onOpen)
  }
  player: Player // could also move 'player' slot to GamePlay [which also holds hgClient]
  gamePlay: GamePlay0

  override parseEval(message: HgMessage) {
    let type = message.type
    switch (type) {
      case HgType.chat: this.eval_chat(message); break
      case HgType.join: this.eval_join(message); break
      case HgType.none: this.eval_none(message); break
      case HgType.undo: this.eval_undo(message); break
      case HgType.makeMove: this.eval_makeMove(message);break
      case HgType.sendMove: this.eval_sendMove(message); break
      case HgType.progress: break
      case HgType.setParam: break
    }
  }
  /** indicates it is my turn to find the next Move. */
  eval_makeMove(message: HgMessage) {
    let { sc, iHistory, incb } = JSON.parse(message.json)
    this.player.playerMove(sc, undefined, incb)
    this.player.planner.makeMove(sc, iHistory, incb)
  }
  /** indicates curPlayer has sent their next Move */
  eval_sendMove(message: HgMessage) {
    let map = this.gamePlay.hexMap
    let { sc, iHistory } = JSON.parse(message.json), move = iHistory[0], hex = Hex.ofMap(move.hex, map)
    let hev = new HexEvent(S.add, hex, sc)
    this.player.table.gamePlay.localMoveEvent(hev)
  }
  eval_progress(message: HgMessage) {
  }
  eval_setParam(message: HgMessage) {
    let { targetName, fieldName, value } = JSON.parse(message.json)
    if (HgClient.paramNames.includes(fieldName) && targetName == 'TP') {
      let line: ParamLine
      let gui = GameSetup.setup.paramGUIs.find(gui => (line = gui.findLine(fieldName)))
      if (gui) {
        gui.selectValue(fieldName, value, line)
      }
      if (targetName === 'TP') TP[fieldName] = value
    }
  }
static paramNames = ['nHexes', 'mHexes', 'allowSuicide']
}
export class HgReferee extends GgRefMixin<HgMessage, typeof HgClient>(HgClient) {
  /** indicates curPlayer has sent their next Move */
  override eval_sendMove(message: HgMessage) {
    super.eval_sendMove(message)  // localMakeMove & then send it:
    let { client_from, type } = message
    this.sendCgAck('move accepted', { client_id: client_from })
    let outmsg = new HgMessage({ type })
    outmsg.json = message.json
    this.send_message(outmsg, { nocc: true, client_from })
  }
}
