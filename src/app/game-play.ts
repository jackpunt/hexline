import { HexAxis, H, InfDir } from "./hex-intfs";
import { Hex, Hex2, HexMap, S_Resign } from "./hex";
import { HexEvent } from "./hex-event";
import { S, stime, Undo, KeyBinder } from "@thegraid/createjs-lib";
import { GameStats, TableStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColors} from "./table-params"
import { Planner } from "./robo-player";
import { GameSetup } from "./game-setup";

type HSC = { hex: Hex, color: StoneColor }
type AxisDone = { [key in HexAxis]?: Set<Hex> }
export class GamePlay0 {

  constructor(gamePlay0?: GamePlay0) {
    if (gamePlay0) {
      this.original = gamePlay0
      this.hexMap = gamePlay0.hexMap
      this.history = gamePlay0.history
      this.redoMoves = gamePlay0.redoMoves
      this.allBoards = gamePlay0.allBoards
      this.allPlayers = gamePlay0.allPlayers
      this.gStats = gamePlay0.gStats  // but may not be defined...
    } else {
      this.hexMap = new HexMap()
      this.history = []
      this.redoMoves = []
      this.allBoards = new BoardRegister()
      this.allPlayers = stoneColors.map((color, ndx) => new Player(ndx, color, this))
      this.gStats = new GameStats(this.hexMap, this.allPlayers) // AFTER allPlayers are defined so can set pStats
    }
  }

  gStats: GameStats
  readonly hexMap: HexMap = new HexMap()
  readonly history: Move[] = []          // sequence of Move that bring board to its state
  readonly redoMoves: Move[] = []
  readonly allBoards = new BoardRegister()
  readonly allPlayers: Player[];

  readonly original: GamePlay0
  /** last-current Hex to be played: immune to 'capture' [cf table.markHex] */
  curHex: Hex;
  /** Transient: set by GamePlay: captureStone <- skipAndSet <- assertInfluenceDir <-assertInfluence <- addStone */
  captured: Hex[] = []
  undoInfluence: Undo = new Undo() // used by getCaptures()

  turnNumber: number = 0
  get roundNumber() {return Math.floor((this.turnNumber - 1) / this.allPlayers.length) + 1 }

  get numPlayers(): number { return this.allPlayers.length; }

  curPlayer: Player;
  getPlayer(color: StoneColor): Player {
    return this.allPlayers.find(p => p.color == color)
  }

  otherPlayer(plyr: Player = this.curPlayer) { return this.getPlayer(otherColor(plyr.color))}

  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }
  setNextPlayer(plyr = this.otherPlayer()): Player {
    if (plyr != this.curPlayer) this.endCurPlayer() // clean up nextHex on undo/skip/redo...
    this.turnNumber += 1
    return this.curPlayer = plyr
  }
  endCurPlayer() {}

  /**
   * clear Stones & influence, add Stones, assertInfluence
   * @param board 
   */
  recalcBoard(board: HSC[]) {
    let axisDone: AxisDone = {} // indexed by axis: Set<H.axis>
    // doing hex.clearColor() en masse:
    this.hexMap.allStones.splice(0, this.hexMap.allStones.length)
    this.hexMap.forEachHex(hex => { 
      hex instanceof Hex2 && (hex.stone = undefined);
      hex.clearInf() }) // QQQ: this.setStone(undefined) ??
    board.forEach(hsc => {
      this.setStoneColor(hsc.hex, hsc.color)    // set StoneColors on map
    })
    // scan each Line once to assert influence
    board.forEach(hsc => {
      this.assertInfluence(hsc.hex, hsc.color, false, axisDone) // TODO: NEEDS WORK567890
    })
  }

  undoRecs: Undo = new Undo().enableUndo();
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) { 
    this.undoRecs.addUndoRec(obj, name, value); 
  }  
  undoStones() {
    this.undoRecs.pop(); // replace Stones, remove capMarks
  }
  undoCore(move: Move) {
      this.undoStones()             // remove last Stone, replace captures
      this.undoCapMarks(move.captured)
      this.gStats.update()          // reset stats: inControl & score; check for 'win'
  }
  undoMove(undoTurn: boolean = true) {
    let move: Move = this.history.shift() // remove last Move
    if (!!move) {
      this.redoMoves.unshift(move)  // redoMoves[0] == move0
      this.undoCore(move)
      if (undoTurn) {
        this.turnNumber -= 2        // will immediately increment to tn+1
        this.setNextPlayer()
      }
      let move0 = this.history[0]  // the new, latest 'move'
      if (!!move0) {
        move0.board.setRepCount(this.history) // undo: decrement repCount; because: shift()
      }
    }
  }

  /** unmarkCapture (& capMarks if Hex2), reset current capture to history[0] */
  undoCapMarks(captured: Hex[]) {
    captured.forEach(hex => hex.unmarkCapture())
    if (this.history[0]) this.history[0].captured.forEach(hex => hex.markCapture())
  }

  doPlayerSkip(hex: Hex, stoneColor: StoneColor) {  }  // doPlayerMove records history; override sets undoSkip 
  doPlayerResign(hex: Hex, stoneColor: StoneColor) { } // doPlayerMove records history

  setStoneColor(hex: Hex, stoneColor: StoneColor) {
    hex.setColor(stoneColor) // Note: GamePlay.setStoneColor does: table.setStone(stoneColor, Hex2)
  }
  /** addStone to setStone(hex)->hex.setStone(color); assertInfluence & Captured; addUndoRec (no stats) */
  addStone(hex: Hex, stoneColor: StoneColor) {
    this.setStoneColor(hex, stoneColor)  // move Stone onto Hex & HexMap [hex.stone = stone]
    this.assertInfluence(hex, stoneColor)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stoneColor})`, () => this.removeStone(hex)) // remove for undo
    }
  }
  /** 
   * remove Move that placed hex
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  removeStone(hex: Hex) {
    let stoneColor = hex.clearColor()            // Hex2.stone = undefined; remove HSC from allStones
    this.assertInfluence(hex, stoneColor, false) // reassert stoneColor on line (for what's left)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `undoRemove(${hex.Aname}:${stoneColor})`, () => this.addStone(hex, stoneColor)) // undoRemove
    }
  }
  unmarkOldCaptures() { // when doPlayerMove()
    if (this.history[0]) this.history[0].captured.forEach(hex => hex.unmarkCapture())
  }

  /** remove captured Stones, from placing Stone on Hex */
  doPlayerMove(hex: Hex, stoneColor: StoneColor): StoneColor {
    this.unmarkOldCaptures()   // this player no longer constrained
    this.curHex = hex;         // immune from capture in skipAndSet

    let move = new Move(hex, stoneColor)
    this.history.unshift(move) // record Move in History[0] (including Skip & Resign)
    if (hex == this.hexMap.skipHex) {
      this.doPlayerSkip(hex, stoneColor)
    } else if (hex == this.hexMap.resignHex) {
      this.doPlayerResign(hex, stoneColor) // addBoard will detect
    } else {
      this.captured = []
      this.addStone(hex, stoneColor) // add Stone and Capture (& removeStone) w/addUndoRec
      if (hex.isCapture(otherColor(stoneColor))) alert(`illegal move: ${stoneColor} ${hex.Aname}`)
      move.captured = this.captured;
    }

    this.undoRecs.closeUndo()
    //console.log(stime(this, `.doPlayerMove: undoInfluence=`), this.undoInfluence) // confirm: EMPTY
    this.undoInfluence.flushUndo() // <=== no going back! [skipAndSet] maybe just closeUndo() ??

    move.board = this.allBoards.addBoard(move, this.hexMap)
    move.board.setRepCount(this.history) // >= 1 [should be NO-OP, from addBoard]
    let win = this.gStats.update() // showRepCount(), showWin()
    //this.setNextPlayer() 
    return win
  }
  
  /** return Array<Hex> of each Hex (west-to-east) on the given axis, with Stone of color. 
   * @param color if undefined, return all Hex on axis
   */
  hexlineToArray(hex: Hex, ds: HexAxis, color: StoneColor): Hex[] {
    let rv: Array<Hex> = (!color || (hex.stoneColor === color)) ? [hex] : []
    let nhex: Hex = hex
    while (!!(nhex = nhex.links[ds])) {
      if (!color || nhex.stoneColor === color) rv.push(nhex)
    }
    let dr = H.dirRev[ds]; 
    nhex = hex
    while (!!(nhex = nhex.links[dr])) {
      if (!color || nhex.stoneColor === color) rv.unshift(nhex)
    }
    return rv
  }

  /** 
   * When incr add: emit undoRecs & undoInfluence & undoCapture
   * 
   * Note: capture only occurs during incr-addInfluence
   * 
   * Note: removal of influence (due to capture) is 'undone' when undo [re-]adds the Stone
   * @param hex center of influence; may be empty (esp when !incr: after removal)
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
    // addUndoRec for the new capture marks:
    if (this.captured.length > capLen)
      this.addUndoRec(this, `undoCapture(${this.captured.length})`, ()=>this.undoCapMarks(this.captured.slice(capLen)))

  }
  /** remove StoneColor influence & InfMark(axis) from line(hex,ds) 
   * return all Stones of color on the line
   */
  removeInfluenceDir(hex: Hex, ds: HexAxis, color: StoneColor): Hex[] {
    let line = this.hexlineToArray(hex, ds, undefined) // ALL hexes on the line
    //this.showLine(`.removeInfluenceDir:${hex.Aname}:${color}`, line)
    return line.filter(hex => { 
      hex.delInf(color, ds, true)     // do not addUndoRec()
      return (hex.stoneColor === color)
    })
  }
  // from line of Hex -> set Influence in Hex & HexMap
  /** show influence on map AND remove captured stones */
  assertInfluenceDir(hex: Hex, ds: HexAxis, color: StoneColor, incr = false, 
    line: Hex[] = incr ? [hex] : this.hexlineToArray(hex, ds, color)) {
    // Hexes with Stones of color on line [E..W]
    //this.showLine(`.assertInfluenceDir:${hex.Aname}:${color}`, line)
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
    let undo = this.undoInfluence     // skipAndSet is undoable by getCaptures()
    if (incr && nhex.getInf(color, dn)) {
      nhex.delInf(color, dn, false, undo);
      this.skipAndSet(nhex, color, ds, dn, incr)
    }
    do { nhex = nhex.links[dn] } while (nhex?.isInf(color, dn))
    if (!nhex) return         // end of the line
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
  /** caller can enhance pred, but should/must include call to getCaptures for suicide prevention. */
  isLegalMove(nHex: Hex, color: StoneColor,
    pred: (hex: Hex, color: StoneColor) => boolean = (hex, color) => !!this.getCaptures(hex, color)) {
    if (!!nHex.stoneColor) return false
    if (nHex.isCaptured) return false
    let pstats = this.gStats.pStat(color)
    if (nHex.district == 0 && pstats.dMax <= pstats.dStones[0]) return false
    return pred(nHex, color) // and [generally] this.captured is set
  }

  /**
   * called from dragFunc (or robo-player..), before a Move.
   * assertInfluence on hex of color; without setting a Stone; 
   * see if hex is [still] attacked by other color
   * then undo the influence and undo/replace any captures
   * @return captures (this.captured) or undefined if Move is suicide
   */
  getCaptures(hex: Hex, color: StoneColor, func?: (hex: Hex) => void): Hex[] | undefined {
    let pcaps = this.captured; this.captured = []
    let undo0 = this.undoRecs, undoInf = this.undoInfluence
    this.undoInfluence = new Undo().enableUndo()
    this.undoRecs = new Undo().enableUndo()
    this.curHex = hex                // immune from capture; later check suicide
    this.assertInfluence(hex, color) // may invoke captureStone() -> undoRec(Stone & capMark)
    // capture may *remove* some inf & InfMarks!
    let suicide = hex.isAttack(otherColor(color)), rv = suicide ? undefined : this.captured
    //console.log({undo: this.undoInfluence.concat([]), capt: this.captured.concat([]) })
    if (func) func(hex)
    // like undoMove(), but without history/redo
    this.undoInfluence.closeUndo().pop()
    this.undoRecs.closeUndo().pop()    // like undoStones(); SHOULD replace captured Stones/Colors
    // TODO: addStone(hex) above, and do this always.
    if (!!hex.stoneColor) {            // if: func() {hex.setStone}; esp if undo(capture) -> addStone(hex)
      this.undoRecs.isUndoing = true
      this.removeStone(hex)            // remove without an undoRec!
      this.undoRecs.isUndoing = false
    }
    this.undoRecs = undo0; this.undoInfluence = undoInf
    this.undoCapMarks(this.captured); // undoCapture
    this.captured = pcaps
    return rv
  }
  showLine(str: string, line: Hex[], fn = (h: Hex)=>`${h.Aname}-${h.stoneColor}`) {
    let dss = (line['ds']+' ').substring(0,2)
    console.log(stime(this, str), dss, line.map(fn))
  }
}
/** implement the game logic */
export class GamePlay extends GamePlay0 {
  readonly table: Table
  override readonly gStats: TableStats
  constructor(table: Table) {
    super()            // hexMap, history, allPlayers, gStats...
    // setTable(table)
    this.table = table
    this.gStats = new TableStats(this, table) // AFTER allPlayers are defined so can set pStats
    KeyBinder.keyBinder.setKey('M-z', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('q', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('r', { thisArg: this, func: this.redoMove })
    KeyBinder.keyBinder.setKey('t', { thisArg: this, func: this.skipMove }) // next Turn
    KeyBinder.keyBinder.setKey('M-K', { thisArg: this, func: this.resignMove })// S-M-k
    KeyBinder.keyBinder.setKey('Escape', {thisArg: table, func: table.stopDragging}) // Escape
    KeyBinder.keyBinder.setKey('C-s', { thisArg: GameSetup.setup, func: GameSetup.setup.restart })// C-s START
    KeyBinder.keyBinder.setKey('m', { thisArg: this, func: this.makeMove })
    KeyBinder.keyBinder.setKey('n', { thisArg: this, func: this.autoMove, argVal: true })
    KeyBinder.keyBinder.setKey('N', { thisArg: this, func: this.autoMove, argVal: false})
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
    table.skipShape.on(S.click, () => this.skipMove(), this)
  }
  makeMove() {
    console.log(stime(this, `.makeMove: ${this.curPlayer.color}. useRobo=`), this.curPlayer.useRobo)
    this.curPlayer.makeMove(this.table.nextHex.stone, true) // make one robo move
  }
  autoMove(useRobo: boolean = false) {
    let op = this.otherPlayer(this.curPlayer)
    this.curPlayer.useRobo = op.useRobo = useRobo // if toggle then useRobo = !useRobo
    console.log(stime(this, `.autoMove: ${this.curPlayer.color}.useRobo=`), this.curPlayer.useRobo)
    console.log(stime(this, `.autoMove: ${op.color}.useRobo=`), op.useRobo)
  }
  /** undo last undo block */
  override undoStones() {
    let undoNdx = this.undoRecs.length -1;
    let popRec = (undoNdx >= 0) ? this.undoRecs[undoNdx].concat([]) : [] // copy undoRecs[] so it is stable in log
    console.groupCollapsed(`${stime(this)}:undoIt-${undoNdx}`)
    console.log(stime(this, `.undoStones: undoRec[${undoNdx}] =`), popRec);
    super.undoStones()
    this.hexMap.update();
    console.log(stime(this, `.undoIt: after[${undoNdx}]`), { Stones: [].concat(this.hexMap.allStones), undo: this.undoRecs });
    console.groupEnd()   // "undoIt-ndx"
  }

  override undoMove(undoTurn: boolean = true) {
    this.table.stopDragging() // drop on nextHex (no Move)
    super.undoMove(undoTurn)
    this.showRedoMark()
  }
  redoMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
    let move = this.redoMoves[0]//.shift()
    if (!move) return
    this.table.dispatchEvent(new HexEvent(S.add, move.hex, move.stoneColor))
    this.showRedoMark()
  }
  showRedoMark() {
    let move0 = this.redoMoves[0]
    if (!!move0) {
      this.hexMap.showMark(move0.hex) // unless Skip or Resign...
    }    
  }

  override captureStone(nhex: Hex): void {
    super.captureStone(nhex)
    nhex.markCapture()
  }
  override undoCapMarks(captured: Hex[]): void {
    super.undoCapMarks(captured)
    if (this.history[0]) this.hexMap.showMark(this.history[0].hex)
  }

  skipMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
    this.addStoneEvent(new HexEvent(S.add, this.hexMap.skipHex, this.table.nextHex.stoneColor)) // dummy move for history & redos
  }
  resignMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
    this.addStoneEvent(new HexEvent(S.add, this.hexMap.resignHex, this.table.nextHex.stoneColor)) // move Stone to table.resignHex
  }
  override doPlayerSkip() {
    // undo-skip: clear other Player's Stone from this.table.nextHex
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.nextHex.clearColor()) // undo-skip
  }
  override doPlayerResign(hex: Hex, stoneColor: "black" | "white"): void {
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.nextHex.clearColor()) // undo-resign
  }
  /** remove captured Stones, from placing Stone on Hex */
  override doPlayerMove(hex: Hex, color: StoneColor): StoneColor {
    let win = super.doPlayerMove(hex, color) // skipAndSet -> captureStone -> mark new Captures
    this.hexMap.update()
    if (!!win) {
      // addStoneEvent will NOT invoke this.setNextPlayer()
      super.setNextPlayer()
      this.table.logCurPlayer(true) // log for next move, but do not PutButtonOnPlayer(curPlayer)
    }
    return win
  }
  override setNextPlayer(plyr?: Player): Player {
    super.setNextPlayer(plyr)
    this.hexMap.update()
    return this.table.setNextPlayer()
  }
  override endCurPlayer(): void {
    // IFF stone is [still] ON nextHex: this.table.clearStone() 
    let nextHex = this.table.nextHex, nxtStone = nextHex.stone
    if (nxtStone?.parent) {     // NOTE: nextHex.xy are already rounded:
      if (Math.round(nxtStone.x) == nextHex.x && Math.round(nxtStone.y) == nextHex.y) {
        nxtStone.parent.removeChild(nxtStone)
        this.hexMap.update()
      }
    }
  }

  /** dropFunc indicating new Move attempt */
  addStoneEvent(hev: HexEvent): void {
    let redo = this.redoMoves.shift()   // pop one Move, maybe pop them all:
    if (!!redo && redo.hex !== hev.hex) this.redoMoves.splice(0, this.redoMoves.length)
    // extract the StoneColor, ignore the Stone (thank you for your service!)
    hev.stone?.parent?.removeChild(hev.stone)    // remove nxtStone
    let win = this.doPlayerMove(hev.hex, hev.stoneColor)
    if (!win) this.setNextPlayer()
  }
  removeStoneEvent(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }
}

/** Historical record of each move made. */
export class Move {
  Aname: string
  hex: Hex // where to place stone
  stoneColor: StoneColor
  captured: Hex[] = [];
  board: Board
  constructor(hex: Hex, color: StoneColor) {
    this.Aname = this.toString(hex, color) // for debugger..
    this.hex = hex
    this.stoneColor = color
  }
  toString(hex = this.hex, color = this.stoneColor): string {
    let name = hex.Aname // Hex@[r,c] OR Hex@Skip OR hex@Resign
    return `${color}${name.substring(3)}`
  }
  bString(): string {
    let pid = stoneColors.indexOf(this.stoneColor)
    return `${pid}${this.hex.Aname.substring(3)}`
  }
}
export interface Mover {
  makeMove(stone: Stone, useRobo: boolean): void
}

export class Player implements Mover {
  name: string
  index: number
  color: StoneColor
  mover: Mover
  otherPlayer: Player
  gamePlay: GamePlay0
  planner: Planner
  useRobo: boolean = false
 
  constructor(index: number, color: StoneColor, gamePlay: GamePlay0) {
    this.index = index
    this.color = color
    this.name = `Player${index}-${color}`
    this.gamePlay = gamePlay
    this.planner = new Planner(gamePlay)
  }
  makeMove(stone: Stone, useRobo = false) {
    let table = (this.gamePlay instanceof GamePlay) && this.gamePlay.table
    if (useRobo || this.useRobo) 
      setTimeout(() => this.planner.makeMove(stone, table), 5) // allow repaint
    return 
  }
}

class BoardRegister extends Map<string, Board> {
  /** as Board as Set */
  addBoard(move: Move, hexMap: HexMap) {
    let board = new Board(move, hexMap) // calc board.id
    let b0: Board = this.get(board.id) // find if previous instance of identical Board
    if (!!b0) {
      b0.repCount += 1
      return b0
    }
    this.set(board.id, board)     // Note: boards are never removed, even by undo; just decr repCount
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
  history: Move[]   // to recreate hexMap state
  hexStones: HSC[]  // to recreate hexMap state [without sequence info]
  captured: Hex[]   // captured by current Players's Move
  nextPlayerColor: StoneColor // cannot play into captured Hexes
  repCount: number = 1;
  resigned: StoneColor;   // set to color of Player who resigns to signal end of game.
  /**
   * Record the current state of the game.
   * @param nextPlayerColor identify Player to make next Move (player.color, table.getPlayer(color))
   * @param move Move: resigned & captured: not available for play by next Player
   * @param hexMap supplies board.hexStones[]: { Hex, StoneColor }
   */
  constructor(move: Move, hexMap: HexMap) {
    this.nextPlayerColor = otherColor(move.stoneColor)
    this.resigned = (move.hex.Aname == S_Resign) ? move.stoneColor : undefined // keyboard: 'M-K'
    this.id = this.cString(this.nextPlayerColor, move.captured) + (this.resigned ? move.Aname : '')
    this.hexStones = [].concat(hexMap.allStones)
    let nCol = hexMap.nCol
    this.hexStones.sort((a, b) => { return (a.hex.row - b.hex.row) * nCol + (a.hex.col - b.hex.col) });
    this.hexStones.forEach(hsc => this.id += this.bString(hsc)) // in canonical order

  }
  toString() { return this.id }
  bString(hsc: HSC) { 
    return `${stoneColors.indexOf(hsc.color)}${hsc.hex.Aname.substring(3)}`
  }
  cString(color: StoneColor, captured: Hex[]): string {
    let opc = stoneColors.findIndex(c => (c !== color)), rv = `Board(${opc},` // other player color
    captured.forEach(hex => rv += hex.Aname.substring(4))
    return rv+')'
  }
  setRepCount(history: Move[]) {
    this.repCount = history.filter(hmove => hmove.board === this).length
  }
  getHexMap() {

  }

  /**
   * clear Stones & influence, add Stones, assertInfluence
   */
  makeHexMap(gamePlay: GamePlay0, hexMap?: HexMap) {
    let hsc = this.hexStones, oldMap = hexMap ? undefined : (hexMap = new HexMap())
    let axisDone: AxisDone = {} // indexed by axis: Set<H.axis>
    if (oldMap) {
      // doing hex.clearColor() en masse:
      oldMap.forEachHex(hex => {
        hex.stoneColor = undefined
        hex.clearInf()
        if (hex instanceof Hex2) hex.map.stoneCont.removeChild(hex.stone)   //(hex.stone = undefined); // QQQ:
         gamePlay.setStoneColor(hex, undefined)// ??
      })
      hsc.forEach(hsc => {
        gamePlay.setStoneColor(hsc.hex, hsc.color)    // set StoneColors on map
      })
    }
    // scan each Line once to assert influence
    hsc.forEach(hsc => {
      gamePlay.assertInfluence(hsc.hex, hsc.color, false, axisDone) // TODO: NEEDS WORK567890
    })
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