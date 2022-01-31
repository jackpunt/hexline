import { Hex } from "./hex";
import { Table } from "./table";

/** implement the game logic */
export class GamePlay {
  constructor(table: Table) {
    
  }
}
export class Move {
  hex: Hex // where to place stone
  plyr_ndx: number; // [0,1]
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