import { ValueEvent } from '@thegraid/createjs-lib';
import { Hex } from './hex';
import { Stone } from './table';
import { StoneColor } from './table-params';

export class HexEvent extends ValueEvent {
  hex: Hex
  _stoneColor: Stone | StoneColor
  get stone() { return this._stoneColor instanceof Stone && this._stoneColor }
  get stoneColor() { return (this._stoneColor instanceof Stone) ? this._stoneColor.color : this._stoneColor }
  /** indicates a Stone was dropped on Hex.
   * or maybe a Stone was removed... type: AddStone, RemoveStone
   */
  constructor(type: string, hex: Hex, value?: StoneColor | Stone) {
    super(type, value as any)
    this.hex = hex
    this._stoneColor = value
  }
}