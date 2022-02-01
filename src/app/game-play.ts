import { Dir, S } from "./basic-intfs";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { Table } from "./table";

/** implement the game logic */
export class GamePlay {
  table: Table
  hexMap: HexMap
  board: Board = new Board() // Move indicates Player has Stone on that Hex
  boardHist: Board[] = []      // copy of previous board; turn = history.length
  moveHist: Move[] = []

  constructor(table: Table) {
    this.table = table
    this.hexMap = table.hexMap
  }
  /** remove captured Stones, from placing Stone on Hex */
  updateBoard(move: Move) {
    let turn = this.table.turnNumber
    this.moveHist[turn] = move
    let hex = move.hex, plyr = move.plyr, color = plyr.color
    hex.stone = plyr.color // may be nullified when stone is captured
    // find friends in direction (and revDir) [use NE, E, SW as primary axis]
    // mark Hexes with lines of jeopardy [based on density & spacing]
    // remove capture(s)
    let axis = [Dir.NE, Dir.E, Dir.SE]

    this.board.push(move)     // put new stone on board
    // find captures & remove...
    this.board.forEach(m => {
      axis.forEach((dir: Dir) => {
        let fdir = this.friendsInDir(hex, dir)
        let inf = this.assertInfluence(fdir, dir, color, turn)
      });
      
    })
    this.boardHist[turn] = Array.from(this.board) // BoardHistory[turn]
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
      let hd: Hex = hex[dn], hr: Hex = hex[dr]
      if (!!hd) { rv.push(hd); hd.setInf(dir, color, turn) }
      if (!!hr) { rv.push(hr); hr.setInf(dir, color, turn) }
    })
    return rv
  }
  /** dropFunc */
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
  toString(): string {
    return `${this.plyr.color}${this.hex.Aname.substring(3)}`
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