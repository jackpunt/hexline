import { Hex, IHex } from "./hex";
import { StoneColor } from "./table-params";
import { Board, GamePlay0 } from "./game-play";

/** Historical record of each move made. */
export type IMove = { Aname: string, hex: IHex, stoneColor: StoneColor }

export class Move {
  readonly Aname: string;
  readonly stoneColor: StoneColor;
  readonly hex: Hex; // where to place stone

  /** next player blocked from playing in these Hexes */
  readonly captured: Hex[] = [];
  /** set by GamePlay.incrBoard(Move) */
  board: Board;
  /**  */
  suicide: boolean
  /**
   *
   * @param hex
   * @param stoneColor
   * @param captured
   * @param gamePlay optional: unshift Move to gamePlay.history
   */
  constructor(hex: Hex, stoneColor: StoneColor, captured: Hex[] = [], gamePlay?: GamePlay0) {
    this.Aname = this.toString(hex, stoneColor); // for debug..
    this.stoneColor = stoneColor;
    this.hex = hex;
    this.captured = captured;
    if (gamePlay) { // put this new Move into history[0]
      gamePlay.history.unshift(this);
    }
  }
  toString(hex = this.hex, stoneColor = this.stoneColor): string {
    return hex.toString(stoneColor); // ${color}@hex.rcs
  }
  get bString(): string {
    return `${this.stoneColor}${this.hex.rcs}`; // sc[r,c]
  }
  /** reduce to serializable IMove (removes captured & board) */
  get toIMove(): IMove {
    return { Aname: this.Aname, stoneColor: this.stoneColor, hex: this.hex.toIHex };
  }
  /** override in PlanMove to indicate move.state.fj */
  ind(none = ' ', pre?: string) { 
    let caps = this.captured
    let rv = (pre || (!caps ? '?' : (caps.length > 0) ? `${caps.length}` : none) )
    + (this.suicide ? '$' : ' ')
    return rv
  }
}
