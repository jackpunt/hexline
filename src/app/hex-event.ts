import { Hex } from './hex';
import { PlayerColor } from './table-params';

export class HexEvent {
  /** indicates a Stone is Played to Hex. */
  constructor(public type: string, public hex: Hex, public playerColor: PlayerColor) { }
}
