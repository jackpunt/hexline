import { json } from '@thegraid/common-lib'
import { IGgMessage, Rost } from '@thegraid/wspbclient'
import { HgMsgBase, HgType } from '../proto/HgProto'
export { HgType }

/** HgMessage.Rost as interface: */
//export type rost = { name: string, client: number, player: number }

type HgObjType = ReturnType<HgMsgBase['toObject']>
type HGMK = keyof HgObjType
/** keys to supply to new HgMessage() --> new HgMsgBase() */
export type HgMessageOpts = Partial<Pick<HgMsgBase, HGMK>>
/** keys HgMessage sans 'type' */
export type HgMessageOptT = Partial<Pick<HgMsgBase, Exclude<HGMK, 'type'>>>

/** typeof internal msgObject */
type HgMessageOptsX = HgObjType & { msgType: string }
/** typeof HgMessage.msgObject */
export type HgMessageOptsW = { -readonly [key in keyof HgMessageOptsX] : HgMessageOptsX[key] }

type HgConsType = { -readonly [key in keyof Partial<Pick<HgMsgBase, HGMK>>] : HgMsgBase[key] }

// https://github.com/microsoft/TypeScript/issues/41347
// TS-4.6.2 does not allow Mixins to have override-able get accessors [d.ts cannot tell property from accessor]
// so we forego 'extends MsgTypeMixin(HgMsgBase)' until that is fixed (tsc > ~Jun 2022...)

export class HgMessage extends HgMsgBase implements IGgMessage {
  constructor(obj: HgConsType) {
    super(obj)
  }
  //declare toObject: () => ReturnType<HgMsgBase['toObject']>
  override toObject(): ReturnType<HgMsgBase['toObject']> { return super.toObject()}
  client_from: number
  get msgType() { return HgType[this.type] }
  /** 
   * like toObject(), but only the supplied fields
   * and replace 'type: number' with 'msgType: string' 
   */
  get msgObject(): {} {
    let msgObject = { msgType: `${this.msgType}(${this.type})`} as HgMessageOptsW
    if (this.has_name) msgObject.name = this.name
    if (this.has_inform) msgObject.inform = this.inform
    if (this.has_player) msgObject.player = this.player
    if (this.has_client_to) msgObject.client_to = this.client_to
    if (this.has_json) msgObject.json = this.json
    // Note: roster only meaningful when msgType == 'join(8)'
    if (this.has_roster) msgObject.roster = this.roster.map((item: Rost) => item.toObject())
    return msgObject
  }
  get msgString() { return json(this.msgObject) }

  static override deserialize<HgMessage>(data: Uint8Array) {
    let newMsg = undefined as HgMessage
    if (data == undefined) return newMsg
    newMsg = HgMsgBase.deserialize(data) as any as HgMessage
    if (newMsg instanceof HgMsgBase) {
      Object.setPrototypeOf(newMsg, HgMessage.prototype)
    }
    return newMsg
  }
}
