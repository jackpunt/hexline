import { C, Dir, HexDir, S } from "./basic-intfs";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder } from "./key-binder";
import { Stone, StoneColor, Table } from "./table";
import { stime } from "./types";
import { Undo } from "./undo";

/** implement the game logic */
export class GamePlay {
  table: Table
  hexMap: HexMap
  board: Board = new Board()    // Array<Move>; Move indicates Player has Stone on Hex
  boardHist: Array<Board> = []  // copy of previous board; turn = history.length
  curHex: Hex;                  // last-current Hex [Stone] to be played.

  constructor(table: Table) {
    this.table = table
    this.hexMap = table.hexMap
    this.undoRecs.enableUndo()
    KeyBinder.keyBinder.globalSetKeyFromChar('q', {thisArg: this, func: this.undoMove})
    KeyBinder.keyBinder.globalSetKeyFromChar('t', {thisArg: this.table, func: this.table.setNextPlayer})
  }

  undoRecs: Undo = new Undo();
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) { this.undoRecs.addUndoRec(obj, name, value); }
  /** undo last undo block */
  undoIt() {
    let undoNdx = this.undoRecs.length -1;
    let popRec = this.undoRecs[undoNdx]    // must copy undoRecs[] so it is stable in log:
    console.groupCollapsed(`undoIt-${undoNdx}`)
    console.log(stime(this, `.undoIt: undoRec[${undoNdx}] =`), (undoNdx >= 0) ? [].concat(popRec) : []);

    this.undoRecs.pop();
    this.table.stage.update();
    console.log(stime(this, `.undoIt: after[${undoNdx}] board =`), { board: Array.from(this.board), undo: this.undoRecs });
    console.groupEnd()   // "undoIt-ndx"
  }


  undoMove() {
    let move: Move = this.board.pop()
    if (!move) return
    this.undoIt()
    //this.removeStone(move.hex)
    this.table.turnNumber--
    this.hexMap.update()
  }

  /**
   * clear Stones & influence, add Stones, assertInfluence
   * @param board 
   */
  recalcBoard(board: Board) {
    let linesDone = []
    this.hexMap.forEachHex(hex => {hex.stone = undefined; hex.setNoInf()})
    board.forEach(move => {
      move.hex.stone = move.stone;
      this.assertInfluence(move.hex, move.stone.color, linesDone)
    })
  }

  addStone(hex: Hex, stone: Stone) {
    hex.stone = stone    // put Stone on Hex
    this.board.push(new Move(hex, stone)) // record Stone on Board
    this.hexMap.cont.addChild(stone)
    this.assertInfluence(hex, stone.color)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stone.color})`, () => this.removeStone(hex))
    }
    this.hexMap.update()
  }

  /** 
   * remove Move that placed hex
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  removeStone(hex: Hex) {
    let stone = hex.stone, color = stone.color
    this.board = this.board.filter(m => m.hex !== hex) // remove Move & Stone from board
    this.hexMap.cont.removeChild(stone)
    hex.stone = undefined

    this.assertInfluence(hex, color) // reassert stoneColor on line (for what's left)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `undoCapture(${hex.Aname}:${color})`, () => this.addStone(hex, stone))
    }
    this.hexMap.update()
  }

  /** remove captured Stones, from placing Stone on Hex */
  updateBoard(hex: Hex, stone: Stone) {
    this.curHex = hex;
    this.addStone(hex, stone) // add Stone and Capture

    let turn = this.table.turnNumber
    this.boardHist[turn] = Array.from(this.board) // BoardHistory[turn]
    this.undoRecs.closeUndo()

    if (hex.isCapture(stone.otherColor())) {
      console.log(stime(this, `.updateBoard:`), "Illegal placement/suicide", hex.Aname)
      this.undoIt()
      this.table.useStone(stone)
    } else {
      this.table.setNextPlayer()
    }

    this.hexMap.update()
  }
  showLine(str: string, line: Hex[], fn = (h: Hex)=>`${h.Aname}-${h.stoneColor}`) {
    let dss = (line['ds']+' ').substring(0,2)
    console.log(stime(this, str), dss, line.map(fn))
  }
  /** return East-most Hex in this line */
  eastHex(hex: Hex, ds: HexDir): Hex {
    let nhex: Hex
    while (!!(nhex = hex[ds])) { hex = nhex }
    return hex
  }
  /** return Array<Hex> where each Hex in on the given axis, with Stone of color. 
   * @param color if undefined, return all Hex on axis
   */
  hexlineToArray(hex: Hex, ds: HexDir, color: StoneColor): Hex[] {
    let rv: Array<Hex> = (!color || (hex.stoneColor === color)) ? [hex] : []
    let nhex: Hex = hex
    rv['ds'] = ds
    while (!!(nhex = nhex[ds])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    let dr = S.dirRev[ds]; 
    nhex = hex
    while (!!(nhex = nhex[dr])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    rv.sort((a, b) => b.x - a.x)
    return rv
  }

  assertInfluence(hex: Hex, color: StoneColor, linesDone?: Array<HexDir>) {
    // addUndoRec for each capture (addStone & addInfluence)
    // addUndoRec for each new Influence
    S.dir3.forEach(ds => {
      if (!!linesDone) {
        let eHex = this.eastHex(hex, ds)
        if (linesDone[ds].includes(eHex[0])) return
        linesDone[ds] = eHex[0]
      }
      this.removeInfluenceDir(hex, ds, color) // remove all stoneColor influence from line
      this.assertInfluenceDir(hex, ds, color)
    })
  }
  /** remove StoneColor influence & InfMark from line(hex,ds) */
  removeInfluenceDir(hex: Hex, ds: HexDir, color: StoneColor) {
    let line = this.hexlineToArray(hex, ds, undefined) // ALL hexes on the line
    //this.showLine(`.removeInfluence:${hex.Aname}:${color}`, line)

    line.forEach(hex => {
      let infMark = hex.getInf(ds, color)
      if (!!infMark) {
        this.hexMap.overCont.removeChild(infMark)
        hex.delInf(ds, color)
      }
      this.hexMap.update() // for debug
    })
  }
  // from line of Hex -> set Influence in Hex & HexMap
  /** show influence on map AND remove captured stones */
  assertInfluenceDir(hex: Hex, ds: HexDir, color: StoneColor) {
    let line = this.hexlineToArray(hex, ds, color) // Hexes with Stones of color on line [E..W]
    //this.showLine(`.assertInfluence:${hex.Aname}:${color}`, line)
    let dr = S.dirRev[ds]
    // SINGLE pass: alternating from left/right end of line: insert 'final' influence
    for (let low = 0, high = line.length - 1; high >= 0; low++, high--) {
      this.skipAndSet(line[high], ds, color, ds)
      this.skipAndSet(line[low], ds, color, dr)
      this.hexMap.update() // for debug
    }
    return
  }
  /**
   * 
   * @param nhex start here
   * @param ds assert inf on this axis
   * @param color for StoneColor
   * @param dn scan&skip direction
   * @returns 
   */
  skipAndSet(nhex: Hex, ds: HexDir, color: StoneColor, dn: HexDir) {
    while (!!nhex && nhex.isInf(ds, color, dn)) { nhex = nhex[dn]}
    if (!nhex) return
    let inf: boolean = nhex.setInf(ds, color, dn)
    if (inf && nhex.isCapture(color) && nhex != this.curHex) {
      this.removeStone(nhex) // remove Stone of *other* color
    }
  }
  /** dropFunc */
  addStoneEvent(hev: HexEvent): void {
    let stone = hev.value as Stone
    this.updateBoard(hev.hex, stone)
  }
  removeStoneEvent(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }
}
export class Move {
  hex: Hex // where to place stone
  stone: Stone
  Aname: string
  constructor(hex: Hex, stone: Stone) {
    this.hex = hex
    this.stone = stone
    this.Aname = this.toString()
  }
  toString(): string {
    return `${this.hex.stone.color}${this.hex.Aname.substring(3)}`
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