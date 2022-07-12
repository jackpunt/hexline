import { json } from '@thegraid/common-lib'
import { pbMessage } from '@thegraid/wspbclient'
import { HgMsgBase, HgType } from '../proto/HgProto'
export { HgType } from '../proto/HgProto'

/** HgMessage.Rost as interface: */
//export type rost = { name: string, client: number, player: number }

type HGMK = Exclude<keyof HgMsgBase, Partial<keyof pbMessage> | "serialize">
/** keys to supply to new HgMessage() --> new HgMsgBase() */
export type HgMessageOpts = Partial<Pick<HgMsgBase, HGMK>>
export type HgMessageOptT = Partial<Pick<HgMsgBase, Exclude<HGMK, 'type'>>>

/** typeof HgMesssge.toObject() */
export type HgMessageOptsX = ReturnType<HgMsgBase["toObject"]> & { msgType: string }
/** typeof HgMessage.msgObject */
export type HgMessageOptsW = { -readonly [key in keyof HgMessageOptsX] : HgMessageOptsX[key] }

type HgMsgKeys = Exclude<keyof HgMsgBase, Partial<keyof pbMessage> | "serialize">
type HgConsType = { -readonly [key in keyof Partial<Pick<HgMsgBase, HgMsgKeys>>] : HgMsgBase[key] }
type HgObjType = ReturnType<HgMsgBase['toObject']>

// https://github.com/microsoft/TypeScript/issues/41347
// TS-4.6.2 does not allow Mixins to have override-able get accessors [d.ts cannot tell property from accessor]
// so we forego 'extends MsgTypeMixin(HgMsgBase)' until that is fixed (tsc > ~Jun 2022...)

export class HgMessage extends HgMsgBase  {
  constructor(obj: HgConsType) {
    super(obj)
    console.log(this.toObject().player)
    super.toObject()
  }
  //declare toObject: () => ReturnType<HgMsgBase['toObject']>
  override toObject(): ReturnType<HgMsgBase['toObject']> { return super.toObject()}
  client_from: number
  get msgType() { return HgType[this.type] }
  /** 
   * Remove default values from toObject()
   * and replace 'type: number' with 'msgType: string' 
   */
  get msgObject(): {} {
    let msgObject = { msgType: `${this.msgType}(${this.type})`, ...this?.toObject() }
    if (msgObject.name.length == 0) delete msgObject.name
    if (msgObject.json.length == 0) delete msgObject.json
    if (msgObject.inform.length == 0) delete msgObject.inform
    if (msgObject.player == 0) delete msgObject.player // TODO: assign player=1 & player=2 ... allPlayers[!]
    // roster only meaningful when msgType == 'join(8)'
    if (this.type != HgType.hg_join && this.roster.length == 0) delete msgObject.roster
    delete msgObject.type
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
