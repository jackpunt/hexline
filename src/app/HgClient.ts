import { CgBase, pbMessage, WebSocketBase } from '@thegraid/wspbclient';
import { HgMessage, HgType } from 'src/proto/HgProto';
import { addEnumTypeString, CgClient, CgRefMixin, GgMessage } from './CgClient';
import { Player } from './player';


/** HgMessage Keys */
type HGMK = Exclude<keyof HgMessage, Partial<keyof pbMessage> | "serialize">
export type HgMessageOpts = Partial<Pick<HgMessage, HGMK>>

declare module '../proto/HgProto' {
  interface HgMessage {
    /** HgMessage.type as string (for logging) */
    msgType: string
    client_from: number
  }
}
addEnumTypeString(HgMessage, HgType, 'msgType') // define msgType = get HgType(this.type)
export class HgClient extends CgClient<HgMessage> {
  static maxPlayers = 2
  constructor(url?: string, onOpen?: (hgClient: HgClient) => void) {
    super(HgMessage, CgBase, WebSocketBase)
    this.maxPlayers = HgClient.maxPlayers
    if (url !== undefined) this.connectStack(CgBase, WebSocketBase, url, onOpen)
  }
  player: Player
}

export const HgRefMixin = CgRefMixin<HgMessage, typeof HgClient>(HgClient)
export function newHgReferee(url?: string, onOpen?: (hgReferee: HgClient) => void) {
  return new HgRefMixin(url, onOpen)
}
export type HgReferee = ReturnType<typeof newHgReferee>
