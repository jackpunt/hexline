import { HexDir, HexAxis, H, InfDir } from "./hex-intfs";
import { Hex, HexMap, S_Resign, S_Skip } from "./hex";
import { HexEvent } from "./hex-event";
import { S, stime, Undo, KeyBinder } from "@thegraid/createjs-lib";
import { GameStats, PlayerStats, TableStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColors, TP} from "./table-params"

type HSC = { hex: Hex, color: StoneColor }
type AxisDone = { [key in HexAxis]?: Set<Hex> }
export class GamePlay0 {
  hexMap: HexMap = new HexMap()
  /** last-current Hex to be played: immune to 'capture' [cf table.markHex] */
  curHex: Hex;
  /** set by GamePlay: captureStone <- skipAndSet <- assertInfluenceDir <-assertInfluence <- addStone */
  captured: Hex[] = []
  undoInfluence: Undo = new Undo() // used by isSuicide()

  allBoards = new BoardRegister()
  
  history: Move[] = []          // sequence of Move that bring board to its state
  redoMoves: Move[] = []
  gStats: GameStats
  allPlayers: Player[] = [];
  turnNumber: number = 0
  get roundNumber() {return Math.floor((this.turnNumber - 1) / this.allPlayers.length) + 1 }

  constructor() {
    this.makeAllPlayers()
    this.undoRecs.enableUndo()
  }

  getNumPlayers(): number { return this.allPlayers.length; }
  curPlayerNdx: number = 0;
  curPlayer: Player;
  getPlayer(color: StoneColor): Player {
    return this.allPlayers.find(p => p.color == color)
  }
  get nextPlayerIndex() {
    return (this.curPlayer.index + 1) % this.allPlayers.length;
  }
  get nextPlayer() { return this.allPlayers[this.nextPlayerIndex]}
  makeAllPlayers() {
    this.allPlayers = []
    this.allPlayers[0] = new Player(0, stoneColors[0])
    this.allPlayers[1] = new Player(1, stoneColors[1])
    this.gStats = new GameStats(this.hexMap, this.allPlayers) // AFTER allPlayers are defined so can set pStats
  }
  otherPlayer(plyr: Player) { return plyr == this.allPlayers[0] ? this.allPlayers[0] : this.allPlayers[1]}
  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }
  setNextPlayer(ndx = this.nextPlayerIndex): Player {
    if (ndx != this.curPlayerNdx) this.endCurPlayer() // clean up nextHex on undo/skip/redo...
    this.turnNumber += 1
    this.curPlayerNdx = ndx;
    return this.curPlayer = this.allPlayers[ndx]
  }
  endCurPlayer() {}

  undoRecs: Undo = new Undo();
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) { 
    this.undoRecs.addUndoRec(obj, name, value); 
  }  
  undoStones() {
    this.undoRecs.pop(); // replace Stones, remove capMarks
  }
  undoMove(undoTurn: boolean = true) {
    let move: Move = this.history.shift() // remove last Move
    if (!!move) {
      this.redoMoves.unshift(move)  // redoMoves[0] == move0
      this.undoStones()             // remove last Stone, replace captures
      this.undoCapture(move.captured)
      if (undoTurn) {
        this.turnNumber -= 2        // will immediately increment to tn+1
        this.setNextPlayer()
      }
      let move0 = this.history[0]  // the new, latest 'move'
      if (!!move0) {
        move0.board.setRepCount(this.history) // undo: decrement repCount; because: shift()
        this.gStats.update(move0.board)
      }
    }
  }
  undoCapture(captured: Hex[ ]) { }
  doPlayerSkip(hex: Hex, stone: Stone) {  }  // TODO: put something on history?
  doPlayerResign(hex: Hex, stone: Stone) { } // TODO: ??

  setStone(hex: Hex, stone: Stone) {
    hex.setStone(stone)
  }
  /** addStone to hexMap(hex), assertInfluence, Captured, Undo & Stats? */
  addStone(hex: Hex, stone: Stone) {
    this.setStone(hex, stone)  // move Stone onto Hex & HexMap [hex.stone = stone]
    this.assertInfluence(hex, stone.color)
  }
  /** 
   * remove Move that placed hex
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
   removeStone(hex: Hex) {
    let stone = hex.clearStone()

    this.assertInfluence(hex, stone.color, false) // reassert stoneColor on line (for what's left)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `undoRemove(${hex.Aname}:${stone.color})`, () => this.addStone(hex, stone)) // undoRemove
    }
  }

  /** remove captured Stones, from placing Stone on Hex */
  doPlayerMove(hex: Hex, stone: Stone) {
    this.curHex = hex;

    let move = new Move(hex, stone)
    this.history.unshift(move) // record Move in History
    this.captured = []
    if (hex == this.hexMap.skipHex) {
      this.doPlayerSkip(hex, stone)
    } else if (hex == this.hexMap.resignHex) {
      this.doPlayerResign(hex, stone) // addBoard will detect
    } else {
      this.addStone(hex, stone) // add Stone and Capture (& removeStone) w/addUndoRec
    }
    move.captured = this.captured;
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stone.color})`, () => this.removeStone(hex)) // remove for undo
    }
    this.undoInfluence.flushUndo()   // TODO: modularize to gamePlay.allowDrop(hex)
    this.undoRecs.closeUndo()

    move.board = this.allBoards.addBoard(this.nextPlayerIndex, move, this.hexMap)
    move.board.setRepCount(this.history) // >= 1 [should be NO-OP, from addBoard]
    this.gStats.update(move.board) // showRepCount(), showWin()
    this.setNextPlayer()
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
    rv.sort((ahex, bhex) => bhex.x - ahex.x)
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
    if (nhex.isCapture(color) && nhex != this.curHex) {  // pick up suicide later...
      this.captureStone(nhex) // capture Stone of *other* color
    }
  }
  captureStone(nhex: Hex) {
    this.captured.push(nhex)
    this.removeStone(nhex)
  }
  get lastCaptured(): Hex[] {
    return this.captured
  }

  /**
   * called from dragFunc, before a Move.
   * assertInfluence on hex of color; without setting a Stone; 
   * see if hex is [still] attacked by other color
   * then undo the influence and undo/replace any captures
   * @return captures (this.captures) or undefined is Move is suicide
   */
  getCaptures(hex: Hex, color: StoneColor): Hex[] | undefined {
    this.captured = []
    this.undoInfluence.flushUndo().enableUndo()
    let undo0 = this.undoRecs
    this.undoRecs = new Undo().enableUndo()
    this.curHex = hex                // pretend we move here
    this.assertInfluence(hex, color) // may invoke captureStone() -> undoRec(Stone & capMark)
    // capture may *remove* some inf & InfMarks!
    let suicide = hex.isAttack(otherColor(color))
    //console.log({undo: this.undoInfluence.concat([]), capt: this.captured.concat([]) })
    this.undoInfluence.closeUndo().pop()
    this.undoRecs.closeUndo().pop()
    this.undoRecs = undo0
    this.undoCapture(this.captured);
    return suicide ? undefined : this.captured
  }
  showLine(str: string, line: Hex[], fn = (h: Hex)=>`${h.Aname}-${h.stoneColor}`) {
    let dss = (line['ds']+' ').substring(0,2)
    console.log(stime(this, str), dss, line.map(fn))
  }
}
/** implement the game logic */
export class GamePlay extends GamePlay0 {
  table: Table
  override gStats: TableStats
  constructor(table: Table) {
    super()
    // setTable(table)
    this.table = table
    this.gStats = new TableStats(this, table) // AFTER allPlayers are defined so can set pStats
    KeyBinder.keyBinder.setKey('M-z', {thisArg: this, func: this.undoMove})
    KeyBinder.keyBinder.setKey('q', {thisArg: this, func: this.undoMove})
    KeyBinder.keyBinder.setKey('r', {thisArg: this, func: this.redoMove})
    KeyBinder.keyBinder.setKey('t', {thisArg: this, func: this.skipMove})
    KeyBinder.keyBinder.setKey('M-K', {thisArg: this, func: this.resignMove})// M-S-k
    KeyBinder.keyBinder.setKey('Escape', {thisArg: table, func: table.stopDragging})// M-S-k
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
    table.skipShape.on(S.click, () => this.skipMove(), this)
  }


  /** undo last undo block */
  override undoStones() {
    let undoNdx = this.undoRecs.length -1;
    let popRec = (undoNdx >= 0) ? this.undoRecs[undoNdx].concat([]) : [] // copy undoRecs[] so it is stable in log
    console.groupCollapsed(`undoIt-${undoNdx}`)
    console.log(stime(this, `.undoStones: undoRec[${undoNdx}] =`), popRec);
    super.undoStones()
    this.hexMap.update();
    console.log(stime(this, `.undoIt: after[${undoNdx}]`), { Stones: [].concat(this.hexMap.allStones), undo: this.undoRecs });
    console.groupEnd()   // "undoIt-ndx"
  }
  /** remove capMarks */
  override undoCapture(captured: Hex[], pcap?: Move) {
    captured.forEach(hex => hex.unmarkCapture())
    let pMove = this.history[0]
    if (pMove) {
      pMove.captured.forEach(hex => hex.markCapture())
      this.hexMap.showMark(pMove.hex)
    }
  }

  override undoMove(undoTurn: boolean = true) {
    this.table.stopDragging(true) // drop on nextHex (no Move)
    super.undoMove(undoTurn)
    this.showRedoMark()
  }
  redoMove() {
    this.table.stopDragging(true) // drop on nextHex (no Move)
    let move = this.redoMoves.shift()
    if (!move) return
    move.captured = []
    this.doPlayerMove(move.hex, move.stone)
    this.showRedoMark()
  }
  showRedoMark() {
    let move0 = this.redoMoves[0]
    if (!!move0) {
      this.hexMap.showMark(move0.hex) // unless Skip or Resign...
    }    
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
      this.table.setStone(new Stone(hsc.color), hsc.hex) // new Stone on hexMap [hex.stone = stone]
    })
    // scan each Line once to assert influence
    board.forEach(hsc => {
      this.assertInfluence(hsc.hex, hsc.color, false, axisDone)
    })
  }
  override setStone(hex: Hex, stone: Stone) {
    super.setStone(hex, stone)
    this.table.setStone(stone, hex)
  }
  /** addStone to hexMap(hex), assertInfluence, Captured, Undo & Stats? */
  override addStone(hex: Hex, stone: Stone) {
    super.addStone(hex, stone)
    this.hexMap.update()
  }

  /** 
   * remove Move that placed hex
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  override removeStone(hex: Hex) {
    this.table.clearStone(hex)
    super.removeStone(hex)
    this.hexMap.update()
  }
  override captureStone(nhex: Hex): void {
    super.captureStone(nhex)
    nhex.markCapture()
  }
  unmarkOldCaptures() {
    if (this.history[0]) this.history[0].captured.forEach(hex => hex.unmarkCapture())
  }

  skipMove() {
    this.table.stopDragging(true) // drop on nextHex (no Move)
    this.doPlayerMove(this.hexMap.skipHex, this.table.nextHex.stone) // dummy move for history & redos
  }
  resignMove() {
    this.table.stopDragging(true) // drop on nextHex (no Move)
    this.doPlayerMove(this.hexMap.resignHex, this.table.nextHex.stone) // move Stone to table.resignHex
  }
  override doPlayerSkip() {
    let hex = this.table.nextHex
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.clearStone(hex)) // clear other Player's Stone
  }
  /** remove captured Stones, from placing Stone on Hex */
  override doPlayerMove(hex: Hex, stone: Stone) {
    this.unmarkOldCaptures()       // this player no longer constrained?
    super.doPlayerMove(hex, stone) // skipAndSet -> captureStone -> mark new Captures
    this.hexMap.update()
  }
  override setNextPlayer(ndx?: number): Player {
    super.setNextPlayer(ndx)
    this.hexMap.update()
    return this.table.setNextPlayer(ndx)
  }
  override endCurPlayer(): void {
    let stone: Stone = this.table.nextHex.stone
    if (!!stone && !!stone.parent) {
      stone.parent.removeChild(stone)
      this.hexMap.update()
    }
  }

  /** dropFunc indicating new Move attempt */
  addStoneEvent(hev: HexEvent): void {
    let stone = hev.value as unknown as Stone
    let redo = this.redoMoves.shift()
    if (!!redo && redo.hex !== hev.hex) this.redoMoves = []
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
  captured: Hex[] = [];
  board: Board
  constructor(hex: Hex, stone: Stone) {
    this.hex = hex
    this.stone = stone
    this.Aname = this.toString() // for debugger..
  }
  toString(): string {
    let name = this.hex.Aname // Hex@[r,c] OR Hex@Skip OR hex@Resign
    return `${this.stone.color}${name.substring(3)}`
  }
  bString(): string {
    let pid = stoneColors.indexOf(this.stone.color)
    return `${pid}${this.hex.Aname.substring(3)}`
  }
}
export interface Mover {
  makeMove(stone: Stone): void
}

export class Player implements Mover {
  name: string
  index: number
  color: StoneColor
  stats: PlayerStats;
  mover: Mover
  otherPlayer: Player
 
  constructor(index: number, color: StoneColor) {
    this.index = index
    this.color = color
    this.name = `Player${index}-${color}`
  }
  makeMove(stone: Stone) {
    return 
  }
}

class BoardRegister extends Map<string, Board> {
  /** as Board as Set */
  addBoard(nextPlayerIndex: number, move: Move, hexMap: HexMap) {
    let board = new Board(nextPlayerIndex, move, hexMap) // calc board.id
    let b0: Board = this.get(board.id) // find if previous instance of identical Board
    if (!!b0) {
      b0.repCount += 1
      return b0
    }
    this.set(board.id, board)
    return board
  }
}
/** Identify state of HexMap by itemizing all the extant Stones 
 * nextPlayerIndex
 * captured: Hex[]
 * hexStones: HSC[]
 * repCount
 */
export class Board {
  id: string = ""   // to identify hexMap state
  hexStones: HSC[]  // to recreate hexMap state [not sure we need... maybe just do/undoMove]
  captured: Hex[]   // captured by current Players's Move
  nextPlayerIndex: number // cannot play into captured Hexes
  repCount: number = 1;
  resigned: StoneColor;   // set to color of Player who resigns to signal end of game.
  /**
   * Record the current state of the game.
   * @param nextPlayerIndex identify Player to make next Move (player.color, table.getPlayer(color))
   * @param move Move: resigned & captured: not available for play by next Player
   * @param hexMap supplies board.hexStones[]: { Hex, StoneColor }
   */
  constructor(nextPlayerIndex: number, move: Move, hexMap: HexMap) {
    this.nextPlayerIndex = nextPlayerIndex
    this.resigned = (move.hex.Aname == S_Resign) ? move.stone.color : undefined // keyboard: 'M-K'
    this.id = this.cString(nextPlayerIndex, move.captured)
    this.hexStones = [].concat(hexMap.allStones)
    let nCol = hexMap.nCol
    this.hexStones.sort((a, b) => { return (a.hex.row - b.hex.row) * nCol + (a.hex.col - b.hex.col) });
    this.hexStones.forEach(hsc => this.id += this.bString(hsc)) // in canonical order

  }
  toString() { return this.id }
  bString(hsc: HSC) { 
    return `${stoneColors.indexOf(hsc.color)}${hsc.hex.Aname.substring(3)}`
  }
  cString(nextPlayerIndex: number, captured: Hex[]): string {
    let rv = `Board(${nextPlayerIndex},`
    captured.forEach(hex => rv += hex.Aname.substring(4))
    return rv+')'
  }
  setRepCount(history: Move[]) {
    this.repCount = history.filter(hmove => hmove.board === this).length
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