import { ValueEvent } from './@thegraid/common-lib';
import { Hex } from './hex';
import { Stone } from './table';

export class HexEvent extends ValueEvent {
  hex: Hex

  /** indicates a Stone was dropped on Hex.
   * or maybe a Stone was removed... type: AddStone, RemoveStone
   */
  constructor(type: string, hex: Hex, value?: number | string | Stone) {
    super(type, value as any)
    this.hex = hex
  }
}