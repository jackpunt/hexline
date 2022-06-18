import {BaseDriver, CgBase, CgClient, CgMessage, pbMessage, WebSocketBase} from '@thegraid/wspbclient';
import { HgMessage } from 'src/proto/HgProto';
import { CgDriver } from './CgDriver';
import { IHex } from './hex';
import { IMove } from './move';
import { IPlanner, PlannerProxy } from './plan-proxy';
import { ILogWriter } from './stream-writer';



export class HgClient extends CgDriver<HgMessage> {
  constructor(url?: string, onOpen?: (hgClient: HgClient)=>void) {
    super(CgBase, WebSocketBase, url, ((omDriver: HgClient) => {}))
    if (url !== undefined) this.connectStack(CgBase, WebSocketBase, url, onOpen)
  }

}

class HgDriver extends BaseDriver<HgMessage, never> {
  wsbase: WebSocketBase<pbMessage, pbMessage>;
  cgClient: CgClient<HgMessage>; // === this.dnstream
}

class HgClientPlanner extends PlannerProxy {
  constructor(mh: number, nh: number, index: number, logWriter: ILogWriter) {
    super(mh, nh, index, logWriter)
  }
  hgClient = new HgClient()

  override waitPaused(ident?: string): Promise<void> {
    return super.waitPaused(ident);
  }
  override pause(): void {
    super.pause()
  }
  override resume(): void {
    super.resume()
  }
  override roboMove(run: boolean): void {
    super.roboMove(run)
  }
  override makeMove(stoneColor: 'b' | 'w', history: IMove[], incb?: number): Promise<IHex> {
    return super.makeMove(stoneColor, history, incb)
  }
  override terminate(): void {
    super.terminate()
  }
  
}