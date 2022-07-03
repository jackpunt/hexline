import { addEnumTypeString, CgBase, GgClient, GgRefMixin, pbMessage, WebSocketBase } from '@thegraid/wspbclient';
import { HgMessage, HgType } from 'src/proto/HgProto';
import { Player } from './player';


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
}

export const HgRefMixin = GgRefMixin<HgMessage, typeof HgClient>(HgClient)
export function newHgReferee(url?: string, onOpen?: (hgReferee: HgClient) => void) {
  return new HgRefMixin(url, onOpen)
}
export type HgReferee = ReturnType<typeof newHgReferee>
