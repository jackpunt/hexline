import { HexDir, HexAxis, H, InfDir } from "./hex-intfs";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder, S, stime, Undo } from "./@thegraid/common-lib";
import { PlayerStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColors} from "./table-params"

type HSC = { hex: Hex, color: StoneColor }
type AxisDone = { [key in HexAxis]?: Set<Hex> }

/** implement the game logic */
export class GamePlay {
  table: Table
  hexMap: HexMap
  history: Move[] = []          // sequence of Move that bring board to its state
  redoMoves: Move[] = []
  /** last-current Hex to be played [cf table.markHex] */
  curHex: Hex;

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
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) { 
    this.undoRecs.addUndoRec(obj, name, value); 
  }
  /** undo last undo block */
  undoStones() {
    let undoNdx = this.undoRecs.length -1;
    let popRec = (undoNdx >= 0) ? this.undoRecs[undoNdx].concat([]) : [] // copy undoRecs[] so it is stable in log
    console.groupCollapsed(`undoIt-${undoNdx}`)
    console.log(stime(this, `.undoStones: undoRec[${undoNdx}] =`), popRec);

    this.undoRecs.pop(); // replace Stones, remove capMarks
    this.hexMap.update();
    console.log(stime(this, `.undoIt: after[${undoNdx}]`), { Stones: [].concat(this.hexMap.allStones), undo: this.undoRecs });
    console.groupEnd()   // "undoIt-ndx"
  }
  /** remove capMarks */
  undoCapture(captured: Hex[], pcap?: Move) {
    captured.forEach(hex => hex.unmarkCapture())
    let pMove = this.history[0]
    if (pMove) {
      pMove.captured.forEach(hex => hex.markCapture())
      this.hexMap.showMark(pMove.hex)
    }
  }

  undoMove(undoTurn: boolean = true) {
    let move: Move = this.history.shift() // remove last Move
    if (!move) return
    this.redoMoves.unshift(move)
    this.undoStones()             // remove last Stone, replace captures
    this.undoCapture(move.captured)
    if (undoTurn) {
      this.table.setNextPlayer(undefined, this.table.turnNumber - 1)
    }
    this.hexMap.showMark(move.hex)
    this.table.bStats.update()
    this.hexMap.update()
  }
  redoMove() {
    let move = this.redoMoves.shift()
    if (!move) return
    move.captured = []
    this.doPlayerMove(move.hex, move.stone)
    let move0 = this.redoMoves[0]
    if (!!move0) this.hexMap.showMark(move0.hex)
  }
  /**
   * clear Stones & influence, add Stones, assertInfluence
   * @param board 
   */
  recalcBoard(board: HSC[]) {
    let axisDone: AxisDone = {} // indexed by axis
    this.hexMap.allStones = []
    this.hexMap.forEachHex(hex => { hex.stone = undefined; hex.setNoInf() })
    // put all the Stones on map:
    board.forEach(hsc => {
      this.table.setStone(new Stone(hsc.color), hsc.hex) // new Stone on hexMap
    })
    // scan each Line once to assert influence
    board.forEach(hsc => {
      this.assertInfluence(hsc.hex, hsc.color, false, axisDone)
    })
  }

  addStone(hex: Hex, stone: Stone) {
    this.table.setStone(stone, hex)  // move Stone on Hex

    this.assertInfluence(hex, stone.color)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stone.color})`, () => this.removeStone(hex)) // remove for undo
    }
    //this.hexMap.update()
  }

  /** 
   * remove Move that placed hex
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  removeStone(hex: Hex) {
    let stone = this.table.clearStone(hex)

    this.assertInfluence(hex, stone.color, false) // reassert stoneColor on line (for what's left)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `undoRemove(${hex.Aname}:${stone.color})`, () => this.addStone(hex, stone))
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
  doPlayerMove(hex: Hex, stone: Stone) {
    this.curHex = hex;
    this.unmarkOldCaptures()

    let move = new Move(hex, stone)
    this.history.unshift(move) // record Stone on Board
    if (hex == this.table.nextHex) {
      this.table.clearStone(hex) // skipMove: clear this player's stone
      this.addUndoRec(this.table, 'clearNextHex', () => this.table.clearStone(hex)) // clear other Players Stone
    } else {
      this.addStone(hex, stone) // add Stone and Capture (& removeStone) w/addUndoRec
      move.captured = this.captured;
      this.captured = []
    }
    this.undoInfluence.flushUndo()   // TODO: modularize to gamePlay.allowDrop(hex)
    this.undoRecs.closeUndo()

    move.board = new Board(this.hexMap) // TODO: put 'captured' in Board [because: that is board-state]
    this.table.setNextPlayer()
    this.table.bStats.update()
    this.hexMap.update()
  }
  captured: Hex[] = []
  undoInfluence: Undo = new Undo() // used by isSuicide()
  /**
   * called from dragFunc, before a Move.
   * assertInfluence on hex of color; without setting a Stone; 
   * see if hex is [still] attacked by other color
   * then undo the influence and undo/replace any captures
   * @return true if hex was [still] attacked by otherColor
   */
  isSuicide(hex: Hex, color: StoneColor): boolean {
    this.undoInfluence.flushUndo().enableUndo()
    let undo0 = this.undoRecs
    this.undoRecs = new Undo().enableUndo()
    this.curHex = hex
    this.assertInfluence(hex, color) // may invoke captureStone() -> undoRec(Stone & capMark)
    // capture may *remove* some inf & InfMarks!
    let suicide = hex.isAttack(otherColor(color))
    //console.log({undo: this.undoInfluence.concat([]), capt: this.captured.concat([]) })
    this.undoInfluence.closeUndo().pop()
    this.undoRecs.closeUndo().pop()
    this.undoRecs = undo0
    this.undoCapture(this.captured);
    this.captured = []
    return suicide
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
    let dr = H.dirRev[ds]; 
    nhex = hex
    while (!!(nhex = nhex.links[dr])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    rv.sort((a, b) => b.x - a.x)
    return rv
  }

  /** 
   * When incr add: emit undoRecs & undoInfluence & undoCapture
   * Note: capture only occurs during incr-addInfluence
   * Note: removal of influence is 'undone' when removed Stone is re-added
   * @param hex center of influence; may be empty after removeStone/clearStone. 
   * @param color of stone asserting influence
   * @param incr true to incrementally add influence; false to erase and recompute whole line.
   * @param axisDone allow optimization for repeated add (w/incr == false)
   */
  assertInfluence(hex: Hex, color: StoneColor, incr = true, axisDone?: AxisDone) {
    let capLen = this.captured.length
    H.axis.forEach(ds => {
      if (!!axisDone) {
        let eHex = hex.lastHex(ds), dSet = axisDone[ds] || (axisDone[ds] = new Set<Hex>())
        if (dSet.has(eHex)) return
        dSet.add(eHex)
      }
      if (!incr) {
        // when a stone is removed, remove the whole line, then reaasert:
        let line = 
        this.removeInfluenceDir(hex, ds, color)   // remove influence from whole line
        this.assertInfluenceDir(hex, ds, color, false, line) // reassert influence same line
      } else {
        // when stone is added, just skipAndSet
        this.assertInfluenceDir(hex, ds, color, incr) // assert incremental influence
      }
    })
    if (this.captured.length > capLen)
      this.addUndoRec(this, `undoCapture(${this.captured.length})`, ()=>this.undoCapture(this.captured.slice(capLen)))

  }
  /** remove StoneColor influence & InfMark(axis) from line(hex,ds) */
  removeInfluenceDir(hex: Hex, ds: HexAxis, color: StoneColor): Hex[] {
    let line = this.hexlineToArray(hex, ds, undefined) // ALL hexes on the line
    //this.showLine(`.removeInfluence:${hex.Aname}:${color}`, line)
    let rv: Hex[] = [] ; 
    line.forEach(hex => {
      hex.delInf(color, ds, true)    // do not addUndoRec()
      if (hex.stoneColor === color) rv.push(hex)
    })
    return rv
  }
  // from line of Hex -> set Influence in Hex & HexMap
  /** show influence on map AND remove captured stones */
  assertInfluenceDir(hex: Hex, ds: HexAxis, color: StoneColor, incr = false, 
    line: Hex[] = incr ? [hex] : this.hexlineToArray(hex, ds, color)) {
    // Hexes with Stones of color on line [E..W]
    //this.showLine(`.assertInfluence:${hex.Aname}:${color}`, line)
    let dr = H.dirRev[ds]
    // SINGLE pass: alternating from left/right end of line: insert 'final' influence
    for (let low = 0, high = line.length - 1; high >= 0; low++, high--) {
      this.skipAndSet(line[high], color, ds, ds, incr)
      this.skipAndSet(line[low], color, ds, dr, incr)
      this.hexMap.update() // for debug
    }
    return
  }
  /**
   * Assume initial nhex is occupied by a Stone of color: nhex.isInf(dn,color)
   * this.undoInfluence.addUndoRec() for each newly-added influence
   * @param nhex start here 
   * @param ds assert inf on this axis
   * @param color for StoneColor
   * @param dn scan&skip direction
   * @returns 
   */
  skipAndSet(nhex: Hex, color: StoneColor, ds: HexAxis, dn: InfDir, incr = false) {
    let undo = this.undoInfluence
    if (incr && nhex.getInf(color, dn)) {
      nhex.delInf(color, dn, false, undo);
      this.skipAndSet(nhex, color, ds, dn, incr)
    }
    nhex = nhex.links[dn]
    while (!!nhex && nhex.isInf(color, dn)) { nhex = nhex.links[dn]}
    if (!nhex) return
    nhex.setInf(color, dn, ds, incr ? undo : undefined)  // no undo when remove
    if (nhex.isCapture(color) && nhex != this.curHex) {
      this.captureStone(nhex) // capture Stone of *other* color
    }
  }
  captureStone(nhex: Hex) {
    this.captured.push(nhex)
    nhex.markCapture()
    this.removeStone(nhex)
  }
  get lastCaptured(): Hex[] {
    return this.captured
  }
  /** dropFunc indicating new Move attempt */
  addStoneEvent(hev: HexEvent): void {
    let stone = hev.value as unknown as Stone
    let redo = this.redoMoves.shift()
    if (!!redo) {
      if (redo.hex !== hev.hex) this.redoMoves = []
    }
    this.doPlayerMove(hev.hex, stone)
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
  board: Board
  constructor(hex: Hex, stone: Stone) {
    this.hex = hex
    this.stone = stone
    this.Aname = this.toString()
  }
  toString(): string {
    let name = this.hex.Aname
    return `${this.stone.color}${name === 'nextHex' ? '-Skip' :name.substring(3)}`
  }
  bString(): string {
    let pid = stoneColors.indexOf(this.stone.color)
    return `${pid}${this.hex.Aname.substring(3)}`
  }
}
export interface Mover {
  makeMove(): void
}

export class Player implements Mover {
  table: Table;
  name: string
  index: number
  color: StoneColor
  stats: PlayerStats;
  mover: Mover
 
  constructor(table: Table, index: number, color: StoneColor) {
    this.table = table
    this.index = index
    this.color = color
    this.name = `Player${index}-${color}`
  }
  makeMove() {
    return 
  }

  
}

/** Identify state of HexMap by itemizing all the extant Stones */
export class Board {
  static allBoards = new Map<string, Board>()
  id: string = ""   // to identify hexMap state
  hexStones: HSC[]  // to recreate hexMap state [not sure we need... maybe just do/undoMove]
  constructor(hexMap: HexMap) {
    this.hexStones = [].concat(hexMap.allStones)
    let nCol = hexMap.nCol
    this.hexStones.sort((a, b) => { return (a.hex.row - b.hex.row) * nCol + (a.hex.col - b.hex.col) });
    this.hexStones.forEach(hsc => this.id += this.bString(hsc)) // in canonical order
    Board.allBoards.set(this.id, this)
  }
  bString(hsc: HSC) { 
    return `${stoneColors.indexOf(hsc.color)}${hsc.hex.Aname.substring(3)}`
  }
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