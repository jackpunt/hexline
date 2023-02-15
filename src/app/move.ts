import { Board, GamePlay0 } from "./game-play";
import { Hex, IHex } from "./hex";
import { otherColor, PlayerColor, TP } from "./table-params";

/** Historical record of each move made; sans captured, sacrifice, board which can be recomputed. */
export type IMove = { Aname: string, hex: IHex, playerColor: PlayerColor }

export class Move {
  readonly Aname: string;
  readonly playerColor: PlayerColor;
  readonly hex: Hex; // where to place stone

  /** next player blocked from playing in these Hexes */
  readonly captured: Hex[] = [];
  /** set by GamePlay.incrBoard(Move) */
  board: Board;
  /**  */
  sacrifice: boolean

  get isFreeJeopardy() {
    return this.captured.length == 0 && this.hex.isThreat(otherColor(this.playerColor))
  }
  /**
   * Move.Anmae = hex.toString => `colorScheme[sc]@${hex.rcs}`
   * @param hex
   * @param playerColor
   * @param captured
   * @param gamePlay optional: unshift Move to gamePlay.history
   */
  constructor(hex: Hex, playerColor: PlayerColor, captured: Hex[] = [], gamePlay?: GamePlay0) {
    this.Aname = hex.toString(playerColor); // for debug ==> move.toString()
    this.playerColor = playerColor;
    this.hex = hex;
    this.captured = captured;
    if (gamePlay) { // put this new Move into history[0]
      gamePlay.history.unshift(this);
    }
  }
  /** fixed format: 'COLOR@[ r, c]' | 'COLOR@Resign ' */
  toString(hex = this.hex, playerColor = this.playerColor): string {
    return `${TP.colorScheme[playerColor]}@${this.hex.rcsp}${this.ind}`; // Move.toString => hex.toString => COLOR@rcs || S_Skip/S_Resign
  }
  get bString(): string {
    return `${this.playerColor}${this.hex.rcs}`; // sc[r,c]
  }
  /** reduce to serializable IMove (removes captured & board) */
  get toIMove(): IMove { return this.hex.iMove(this.playerColor) }

  /** override in PlanMove to indicate move.state.fj */
  get ind() {
    let caps = this.captured, cp = caps.length > 0, atk = this.hex.isThreat(otherColor(this.playerColor))
    let rv = (this.sacrifice ? '$' : !atk ? ' ' : cp ? '-' : '!') + (cp ? `${caps.length}` : atk ? '!' : ' ')
    return rv
  }
}
