import { Dir, S } from "./basic-intfs";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { Table } from "./table";

/** implement the game logic */
export class GamePlay {
  table: Table
  hexMap: HexMap
  board: Board // Move indicates Player has Stone on that Hex

  constructor(table: Table) {
    this.table = table
    this.hexMap = table.hexMap
    this.board = new Board()
  }
  /** remove captured Stones, from placing Stone on Hex */
  updateBoard(move: Move) {
    let hex = move.hex, plyr = move.plyr, color = plyr.color, turn = this.table.turnNumber
    hex.stone = plyr.color
    // find friends in direction (and revDir) [use NE, E, SW as primary axis]
    // mark Hexes with lines of jeopardy [based on density & spacing]
    // remove capture(s)
    let axis = [Dir.NE, Dir.E, Dir.SE]
    this.board.forEach(m => {
      axis.forEach((dir: Dir) => {
        let fdir = this.friendsInDir(hex, dir)
        let inf = this.assertInfluence(fdir, dir, color, turn)
      });
      
    })
    this.board.push(move)
    this.hexMap.cont.stage.update()
  }

  friendsInDir(hex: Hex, dir: Dir): Array<Hex> {
    let color = hex.stone, rv = [hex]
    let dn = Dir[dir], nhex: Hex = hex
    while (!!(nhex = nhex[dn])) {
      if (nhex.stone === color) rv.push(nhex)
    }
    dn = S.dirRev[dn], nhex = hex
    while (!!(nhex = nhex[dn])) {
      if (nhex.stone === color) rv.push(nhex)
    }
    rv.sort((a, b) => a.col - b.col)
    return rv
  }
  assertInfluence(fdir: Array<Hex>, dir: Dir, color: string, turn: number): Array<Hex> {
    // initial rough approximation: nearest neighbor only...
    let rv: Hex[] = [], dn = Dir[dir], dr = S.dirRev[dn]
    fdir.forEach((hex: Hex) => {
      let h1: Hex = hex[dn], h2: Hex = hex[dr]
      if (!!h1 && !rv.includes(h1)) { rv.push(h1); h1.setInf(dir, color, turn) }
      if (!!h2 && !rv.includes(h2)) { rv.push(h2); h2.setInf(dir, color, turn) }
    })
    return rv
  }
  addStone(hev: HexEvent): void {
    this.updateBoard(new Move(hev.hex, this.table.curPlayer))
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