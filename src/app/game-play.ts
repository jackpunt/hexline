import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { Table } from "./table";

/** implement the game logic */
export class GamePlay {
  table: Table
  hexMap: HexMap
  board: Array<Move> // Move indicates Player has Stone on that Hex

  constructor(table: Table) {
    this.table = table
    this.hexMap = table.hexMap
    this.board = new Array<Move>()
  }
  /** remove captured Stones, from placing Stone on Hex */
  updateBoard(move: Move) {
    let hex = move.hex, plyr = move.plyr

  }

  addStone(hev: HexEvent): void {
    this.board.push(new Move(hev.hex, this.table.curPlayer))
  }
  removeStone(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }
}
export class Move {
  hex: Hex // where to place stone
  plyr: Player; // [0,1]
  constructor(hex: Hex, plyr: Player) {
    this.hex = hex
    this.plyr = plyr
  }
}
export class Player {
  table: Table;
  name: string
  index: number
  color: string // C.BLACK, C.WHITE
 
  constructor(table: Table, index: number, color: string) {
    this.table = table
    this.index = index
    this.color = color
    this.name = `Player${index}-${color}`
  }
}

export class Board extends Array<Move> {

}
// Given a board[list of Hex, each with B/W stone & next=B/W], 
// generate a list of potential next move (B/W, Hex)
// for each Move: call makeMove(board, move); staticEval(board, B/W); 
// makeMove(board, move): Board;
// --> places the stone, removes any captures, and writes undo records. 
// --> [Undo could just be a copy of the pre-board]
// 
// displayBoard(board) --> clear each Hex, then set each Hex per board;
// --> mark each line that is threatened by B/W (crossing lines imply attack)
// --> for each 'attack' spot, see if it is a legal drop spot (if drop would remove 'attack')
// --> 