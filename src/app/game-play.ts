import { C, Dir, HexDir, HexAxis, S } from "./basic-intfs";
import { Hex, HexMap, InfDir } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder } from "./key-binder";
import { PlayerStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor} from "./table-params"
import { stime } from "./types";
import { Undo } from "./undo";

type HSC = {hex: Hex, color: StoneColor}
/** implement the game logic */
export class GamePlay {
  table: Table
  hexMap: HexMap
  history: Move[] = []          // sequence of Move that bring board to its state
  redos: Move[] = []
  board: HSC[] = []             // Each occupied Hex, with the occupying Stone
  curHex: Hex;                  // last-current Hex [Stone] to be played.

  constructor(table: Table) {
    this.table = table
    this.hexMap = table.hexMap
    this.undoRecs.enableUndo()
    KeyBinder.keyBinder.globalSetKeyFromChar('M-z', {thisArg: this, func: this.undoMove})
    KeyBinder.keyBinder.globalSetKeyFromChar('q', {thisArg: this, func: this.undoMove})
    KeyBinder.keyBinder.globalSetKeyFromChar('r', {thisArg: this, func: this.redoMove})
    KeyBinder.keyBinder.globalSetKeyFromChar('t', {thisArg: this, func: this.skipMove})
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
    table.skipShape.on(S.click, () => this.skipMove(), this)
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
    this.hexMap.update();
    console.log(stime(this, `.undoIt: after[${undoNdx}] board =`), { board: Array.from(this.board), undo: this.undoRecs });
    console.groupEnd()   // "undoIt-ndx"
  }

  undoMove(undoTurn: boolean = true) {
    let move: Move = this.history.shift() // remove last Move
    if (!move) return
    this.redos.unshift(move)
    this.undoIt()             // remove last Stone, replace captures
    move.captured.forEach(hex => hex.unmarkCapture())
    let pMove = this.history[0]
    if (pMove) {
      pMove.captured.forEach(hex => hex.markCapture())
      this.hexMap.showMark(pMove.hex)
    }
    if (undoTurn) {
      this.table.setNextPlayer(undefined, this.table.turnNumber - 1)
    }
    this.table.bStats.update()
    this.hexMap.update()
  }
  redoMove() {
    let move = this.redos.shift()
    if (!move) return
    move.captured = []
    this.doPlayerMove(move)
  }
  /**
   * clear Stones & influence, add Stones, assertInfluence
   * @param board 
   */
  recalcBoard(board: HSC[]) {
    let linesDone = []
    this.hexMap.forEachHex(hex => { hex.stone = undefined; hex.setNoInf() })
    board.forEach(hsc => {
      this.table.setStone(new Stone(hsc.color), hsc.hex) // new Stone on hexMap
      this.assertInfluence(hsc.hex, hsc.color, true, linesDone)
    })
  }

  addStone(hex: Hex, stone: Stone) {
    this.table.setStone(stone, hex)  // move Stone on Hex
    this.board.push({hex: hex, color: stone.color})

    this.assertInfluence(hex, stone.color, false)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stone.color})`, () => this.removeStone(hex)) // remove for undo
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
    let stone = this.table.clearStone(hex)
    this.board = this.board.filter(hsc => hsc.hex !== hex) // remove Move & Stone from board (splice?)

    this.assertInfluence(hex, stone.color) // reassert stoneColor on line (for what's left)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `undoCapture(${hex.Aname}:${stone.color})`, () => this.addStone(hex, stone))
    }
    this.hexMap.update()
  }
  unmarkOldCaptures() {
    this.history[0] && this.history[0].captured.forEach(hex => hex.unmarkCapture())
  }

  skipMove() {
    let hex = this.table.nextHex
    //this.doPlayerMove(new Move(hex, hex.stone)) // dummy move for history & redos
    this.addStoneEvent(new HexEvent('Skip', hex, hex.stone))
  }

  /** remove captured Stones, from placing Stone on Hex */
  doPlayerMove(move: Move) {
    let hex = move.hex, stone = move.stone
    this.curHex = hex;
    this.history[0] && this.history[0].captured.forEach(hex => hex.unmarkCapture())

    this.history.unshift(move) // record Stone on Board
    if (hex == this.table.nextHex) {
      this.table.clearStone(hex) // clear this player's stone
      this.addUndoRec(this.table, 'clearNextHex', () => this.table.clearStone(hex)) // clear other Players Stone
    } else {
      this.addStone(hex, stone) // add Stone and Capture (& removeStone) w/addUndoRec
    }
    this.undoRecs.closeUndo()

    if (hex.isCapture(otherColor(stone.color))) {
      console.log(stime(this, `.updateBoard:`), "Illegal placement/suicide", hex.Aname)
      this.undoMove(false)             // replace captured Stones & prior markCapture
      this.table.setStone(stone)          // return to table.nextHex & Dragable
    } else {
      this.table.setNextPlayer()
    }
    this.table.bStats.update()
    this.hexMap.update()
  }
  showLine(str: string, line: Hex[], fn = (h: Hex)=>`${h.Aname}-${h.stoneColor}`) {
    let dss = (line['ds']+' ').substring(0,2)
    console.log(stime(this, str), dss, line.map(fn))
  }
  /** return Array<Hex> where each Hex in on the given axis, with Stone of color. 
   * @param color if undefined, return all Hex on axis
   */
  hexlineToArray(hex: Hex, ds: HexDir, color: StoneColor): Hex[] {
    let rv: Array<Hex> = (!color || (hex.stoneColor === color)) ? [hex] : []
    let nhex: Hex = hex
    rv['ds'] = ds
    while (!!(nhex = nhex.links[ds])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    let dr = S.dirRev[ds]; 
    nhex = hex
    while (!!(nhex = nhex.links[dr])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    rv.sort((a, b) => b.x - a.x)
    return rv
  }

  /** 
   * @param hex center of influence; may be empty after removeStone/clearStone. 
   * @param remove false to incrementally add new influence; true to erase and reassert.
   * @param linesDone allow optimization for repeated add (w/remove=false)
   */
  assertInfluence(hex: Hex, color: StoneColor, remove = true, linesDone?: Array<HexDir>) {
    // addUndoRec for each capture (addStone & addInfluence)
    // addUndoRec for each new Influence
    S.axis.forEach(ds => {
      if (!!linesDone) {
        let eHex = hex.lastHex(ds)
        if (linesDone[ds].includes(eHex[0])) return
        linesDone[ds] = eHex[0]
      }
      if (remove) {
        this.removeInfluenceDir(hex, ds, color) // remove all stoneColor influence from line
        this.assertInfluenceDir(hex, ds, color)
      } else {
        this.assertInfluenceDir(hex, ds, color, true)
      }
    })
  }
  /** remove StoneColor influence & InfMark(axis) from line(hex,ds) */
  removeInfluenceDir(hex: Hex, ds: HexAxis, color: StoneColor) {
    let line = this.hexlineToArray(hex, ds, undefined) // ALL hexes on the line
    //this.showLine(`.removeInfluence:${hex.Aname}:${color}`, line)

    line.forEach(hex => {
      hex.delInf(ds, color)
      //this.hexMap.update() // for debug
    })
  }
  // from line of Hex -> set Influence in Hex & HexMap
  /** show influence on map AND remove captured stones */
  assertInfluenceDir(hex: Hex, ds: HexAxis, color: StoneColor, incr = false) {
    let line = incr ? [hex] :this.hexlineToArray(hex, ds, color) // Hexes with Stones of color on line [E..W]
    //this.showLine(`.assertInfluence:${hex.Aname}:${color}`, line)
    let dr = S.dirRev[ds]
    // SINGLE pass: alternating from left/right end of line: insert 'final' influence
    for (let low = 0, high = line.length - 1; high >= 0; low++, high--) {
      this.skipAndSet(line[high], ds, color, ds, incr)
      this.skipAndSet(line[low], ds, color, dr, incr)
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
  skipAndSet(nhex: Hex, ds: HexAxis, color: StoneColor, dn: InfDir, incr = false) {
    if (incr && nhex.getInf(dn, color)) {
      nhex.delInf(ds, color);
      this.skipAndSet(nhex, ds, color, dn)
    }
    while (!!nhex && nhex.isInf(dn, color)) { nhex = nhex.links[dn]}
    if (!nhex) return
    nhex.setInf(dn, color, ds)
    if (nhex.isCapture(color) && nhex != this.curHex) {
      this.history[0].captured.push(nhex)
      nhex.markCapture()
      this.removeStone(nhex) // capture Stone of *other* color
    }
  }
  get lastCaptured(): Hex[] {
    return this.history[0] ? this.history[0].captured : []
  }
  /** dropFunc indicating new Move attempt */
  addStoneEvent(hev: HexEvent): void {
    let stone = hev.value as Stone
    let redo = this.redos.shift()
    if (!!redo) {
      if (redo.hex !== hev.hex) this.redos = []
    }
    this.doPlayerMove(new Move(hev.hex, stone))
  }
  removeStoneEvent(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }
}

/** Historical record of each move made. */
export class Move {
  Aname: string
  hex: Hex // where to place stone
  stone: Stone
  captured: Hex[] = []
  board: Hex[] = []       // state of board after this Move
  constructor(hex: Hex, stone: Stone) {
    this.hex = hex
    this.stone = stone
    this.Aname = this.toString()
  }
  toString(): string {
    return `${this.stone.color}${this.hex.Aname.substring(3)}`
  }
}
export class Player {
  table: Table;
  name: string
  index: number
  color: StoneColor
  stats: PlayerStats;
 
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