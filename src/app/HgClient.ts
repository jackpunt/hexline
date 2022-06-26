import { CgBase, pbMessage, WebSocketBase } from '@thegraid/wspbclient';
import { HgMessage, HgType } from 'src/proto/HgProto';
import { addEnumTypeString, CgClient, CgReferee } from './CgClient';
import { Player } from './player';


/** HgMessage Keys */
type HGMK = Exclude<keyof HgMessage, Partial<keyof pbMessage> | "serialize">
export type HgMessageOpts = Partial<Pick<HgMessage, HGMK>>

declare module '../proto/HgProto' {
  interface HgMessage {
    /** HgMessage.type as string (for logging) */
    msgType: string
  }
}
addEnumTypeString(HgMessage, HgType, 'msgType') // define msgType = get HgType(this.type)

export class HgClient extends CgClient<HgMessage> {
  constructor(url?: string, onOpen?: (hgClient: HgClient) => void) {
    super(HgMessage, CgBase, WebSocketBase)
    if (url !== undefined) this.connectStack(CgBase, WebSocketBase, url, onOpen)
  }
  player: Player
}

/** HgReferee is CgReferee witn HgClient Mixin (or vice versa...) */
export class HgReferee extends CgReferee<HgMessage> {
  get stage() { return {}} // a stage with no canvas, so stime.anno will show " R" for all log(this)
  constructor(url?: string, onOpen?: (hgReferee: HgReferee) => void) {
    super(HgMessage, CgBase, WebSocketBase)
    if (url !== undefined) this.connectStack(CgBase, WebSocketBase, url, onOpen)
  }
  player: Player = undefined
}