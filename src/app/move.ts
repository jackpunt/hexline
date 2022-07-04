import { Board, GamePlay0 } from "./game-play";
import { Hex, IHex } from "./hex";
import { otherColor, StoneColor, TP } from "./table-params";

/** Historical record of each move made; sans captured, suicide, board which can be recomputed. */
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

  get isFreeJeopardy() {
    return this.captured.length == 0 && this.hex.isThreat(otherColor(this.stoneColor))
  }
  /**
   * Move.Anmae = hex.toString => `colorScheme[sc]@${hex.rcs}`
   * @param hex
   * @param stoneColor
   * @param captured
   * @param gamePlay optional: unshift Move to gamePlay.history
   */
  constructor(hex: Hex, stoneColor: StoneColor, captured: Hex[] = [], gamePlay?: GamePlay0) {
    this.Aname = hex.toString(stoneColor); // for debug ==> move.toString()
    this.stoneColor = stoneColor;
    this.hex = hex;
    this.captured = captured;
    if (gamePlay) { // put this new Move into history[0]
      gamePlay.history.unshift(this);
    }
  }
  /** fixed format: 'COLOR@[ r, c]' | 'COLOR@Resign ' */
  toString(hex = this.hex, stoneColor = this.stoneColor): string {
    return `${TP.colorScheme[stoneColor]}@${this.hex.rcsp}${this.ind}`; // Move.toString => hex.toString => COLOR@rcs || S_Skip/S_Resign
  }
  get bString(): string {
    return `${this.stoneColor}${this.hex.rcs}`; // sc[r,c]
  }
  /** reduce to serializable IMove (removes captured & board) */
  get toIMove(): IMove { return this.hex.iMove(this.stoneColor) }
  
  /** override in PlanMove to indicate move.state.fj */
  get ind() { 
    let caps = this.captured, cp = caps.length > 0, atk = this.hex.isThreat(otherColor(this.stoneColor))
    let rv = (this.suicide ? '$' : !atk ? ' ' : cp ? '-' : '!') + (cp ? `${caps.length}` : atk ? '!' : ' ')
    return rv
  }
}
