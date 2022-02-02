import { C, Dir, S } from "./basic-intfs";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { Stone, StoneColor, Table } from "./table";

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
    let {hex, plyr, stone} = move
    let color = stone.color
    hex.stone = move.stone
    //hex.stoneColor = plyr.color // may be nullified when stone is captured
    // find friends in direction (and revDir) [use NE, E, SW as primary axis]
    // mark Hexes with lines of jeopardy [based on density & spacing]
    // remove capture(s)
    let axis = S.Dir3 // [Dir.NE, Dir.E, Dir.SE]

    this.board.push(move)     // put new stone on board
    // find captures & remove...
    this.board.forEach(m => {
      axis.forEach((dir: Dir) => {
        let fdir = this.hexlineToArray(hex, dir)
        let inf = this.assertInfluence(fdir, dir, color)
      });
      
    })
    this.boardHist[turn] = Array.from(this.board) // BoardHistory[turn]
    this.hexMap.cont.stage.update()
  }
  /** return Array<Hex> where each Hex in on the given axis, with Stone of color. 
   * @param color if undefined, return all Hex on axis
   */
  hexlineToArray(hex: Hex, dir: Dir, color: StoneColor = hex.stoneColor): Hex[] {
    let rv: Array<Hex> = (hex.stoneColor === color) ? [hex] : []
    let dn = Dir[dir], nhex: Hex = hex
    while (!!(nhex = nhex[dn])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    dn = S.dirRev[dn], nhex = hex
    while (!!(nhex = nhex[dn])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    rv.sort((a, b) => a.x - b.x)
    return rv
  }

  /** 
   * remove Move that placed hex
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  removeStone(hex: Hex) {
    let color = hex.stoneColor
    this.board = this.board.filter(m => m.hex !== hex) // remove Move & Stone from board
    this.hexMap.cont.removeChild(hex.stone)
    hex.stone = undefined

    S.Dir3.forEach(dir => {
      let dn = Dir[dir], line: Hex[]
      line = this.hexlineToArray(hex, dir) // ALL hexes on the line
      // remove all stoneColor influence from line
      line.forEach(hex => {
        let shape = hex.inf[dn] && hex.inf[dn][color]
        if (!!shape) {
          this.hexMap.overCont.removeChild(shape)
          delete hex.inf[dn][color]
        }
      })
      this.hexMap.cont.stage.update() // for debug
      // reassert stoneColor on line (for what's left)
      line = this.hexlineToArray(hex, dir, color)
      this.assertInfluence(line, dir, color)
    })
  }
  /** show influence on map AND remove captured stones */
  assertInfluence(line: Array<Hex>, dir: Dir, color: StoneColor): Array<Hex> {
    // initial rough approximation: nearest neighbor only...
    let rv: Hex[] = [], dn = Dir[dir], dr = S.dirRev[dn]
    let setInf = (hex: Hex) => { 
      rv.push(hex); hex.setInf(dir, color)
      if (hex.isCapture(color)) {
        this.removeStone(hex)
      }
    }
    line.forEach((hex: Hex) => {
      let hd: Hex = hex[dn], hr: Hex = hex[dr]
      if (!!hd) setInf(hd)
      if (!!hr) setInf(hr)
    })
    return rv
  }
  /** dropFunc */
  addStoneEvent(hev: HexEvent): void {
    let stone = hev.value as Stone
    this.updateBoard(new Move(hev.hex, this.table.curPlayer, stone))
  }
  removeStoneEvent(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }
}
export class Move {
  hex: Hex // where to place stone
  plyr: Player; // [0,1]
  stone: Stone
  constructor(hex: Hex, plyr: Player, stone: Stone) {
    this.hex = hex
    this.plyr = plyr
    this.stone = stone
  }
  toString(): string {
    return `${this.plyr.color}${this.hex.Aname.substring(3)}`
  }
}
export class Player {
  table: Table;
  name: string
  index: number
  color: StoneColor
 
  constructor(table: Table, index: number, color: StoneColor) {
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