import { Event, EventDispatcher } from 'createjs-module';
import { Hex } from './hex';
import { Stone } from './table';

/** send a simple value of type to target. */
export class ValueEvent extends Event {
  value: number | string | Stone;
  constructor(type: string, value: number | string | Stone) {
    super(type, true, true);
    this.value = value;
  }
  /** dispatch ValueEvent via target */
  static dispatchValueEvent(target: EventDispatcher, type: string, value: number | string): boolean {
    return target.dispatchEvent(new ValueEvent(type, value));
  }
}
export class HexEvent extends ValueEvent {
  hex: Hex

  /** indicates a Stone was dropped on Hex.
   * or maybe a Stone was removed... type: AddStone, RemoveStone
   */
  constructor(type: string, hex: Hex, value?: number | string | Stone) {
    super(type, value)
    this.hex = hex
  }
}