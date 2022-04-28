import { HexAxis, H, } from "./hex-intfs";
import { Hex, Hex2, HexMap, S_Resign } from "./hex";
import { HexEvent } from "./hex-event";
import { S, stime, Undo, KeyBinder } from "@thegraid/createjs-lib";
import { GameStats, TableStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColors, TP} from "./table-params"
import { Planner } from "./robo-player";
import { GameSetup } from "./game-setup";

type HSC = { hex: Hex, color: StoneColor }
type AxisDone = { [key in HexAxis]?: Set<Hex> }
export class GamePlay0 {

  constructor(original?: GamePlay0) {
    if (original) {
      this.hexMap = original.hexMap
      this.history = original.history
      this.redoMoves = original.redoMoves
      this.allBoards = original.allBoards
      this.allPlayers = original.allPlayers
      this.gStats = original.gStats  // but may not be defined...
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

  turnNumber: number = 0    // strongly related to history.length

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
  /** record new Board or repCount */
  setBoardAndRepCount(move: Move) {
    return this.allBoards.addBoard(move, this.history)
  }

  undoRecs: Undo = new Undo().enableUndo();
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) { 
    this.undoRecs.addUndoRec(obj, name, value); 
  }  

  doPlayerSkip(hex: Hex, stoneColor: StoneColor) {  }  // doPlayerMove records history; override sets undoSkip 
  doPlayerResign(hex: Hex, stoneColor: StoneColor) { } // doPlayerMove records history

  /** addStone to setStone(hex)->hex.setStone(color); assertInfluence & Captured; addUndoRec (no stats) */
  addStone(hex: Hex, stoneColor: StoneColor) {
    hex.setColor(stoneColor)             // move Stone onto Hex & HexMap [hex.stone = stone]
    this.incrInfluence(hex, stoneColor)
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stoneColor})`, () => this.removeStone(hex)) // remove for undo
    }
  }
  /** 
   * remove Move/HSC from map
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  removeStone(hex: Hex) {
    let stoneColor = hex.clearColor()            // Hex2.stone = undefined; remove HSC from allStones
    this.decrInfluence(hex, stoneColor)          // adjust influence from removed Stone
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `undoRemove(${hex.Aname}:${stoneColor})`, () => this.addStone(hex, stoneColor)) // undoRemove
    }
  }

  /** unmarkCapture (& capMarks if Hex2), reset current capture to history[0] */
  undoCapMarks(captured: Hex[]) {
    captured.forEach(hex => hex.unmarkCapture())
    this.history[0]?.captured.forEach(hex => hex.markCapture())
  }
  unmarkOldCaptures() { // when doPlayerMove()
    this.history[0]?.captured.forEach(hex => hex.unmarkCapture())
  }

  /** remove captured Stones, from placing Stone on Hex */
  doPlayerMove(hex: Hex, stoneColor: StoneColor): StoneColor {
    this.unmarkOldCaptures()   // this player no longer constrained

    let move = new Move(hex, stoneColor, [])
    this.history.unshift(move) // record Move in History[0] (including Skip & Resign)
    if (hex == this.hexMap.skipHex) {
      this.doPlayerSkip(hex, stoneColor)
    } else if (hex == this.hexMap.resignHex) {
      this.doPlayerResign(hex, stoneColor) // addBoard will detect
    } else {
      this.addStone(hex, stoneColor) // add Stone and Capture (& removeStone) w/addUndoRec
      if (hex.isCapture(otherColor(stoneColor))) alert(`illegal move: ${stoneColor} ${hex.Aname}`)
    }

    this.undoRecs.closeUndo()
    this.setBoardAndRepCount(move) // set/reduce repCount to actual value 
    let win = this.gStats.update(move) // check for WIN: showRepCount(), showWin()
    return win
  }
  
  /** after add Stone to hex: propagate influence in each direction; maybe capture. */
  incrInfluence(hex: Hex, color: StoneColor) {
    H.infDirs.forEach(dn => {
      let inc = hex.getInf(color, dn)         // because hex.stone: hex gets +1, and passes that on
      hex.propagateIncr(color, dn, inc, (hexi) => {
        if (hexi != hex && hexi.isCapture(color, hex)) {  // pick up suicide later... (hexi != hex <== curHex)
          this.captureStone(hexi)               // capture Stone of *other* color
        }
      })
    })
  }
  //         v
  // 0 0 *1 *2 *3 3 2 1
  // 0 0 *1  1 *1 1 0 0
  /** after remove Stone from hex: propagate influence in each direction. */
  decrInfluence(hex: Hex, color: StoneColor) {
    H.infDirs.forEach(dn => {
      //let inc = hex.links[H.dirRev[dn]]?.getInf(color, dn) || 0
      let inf = hex.getInf(color, dn) - 1     // reduce because stone is gone
      hex.propagateDecr(color, dn, inf)       // because no-stone, hex gets (inf - 1)
    })
  }

  captureStone(nhex: Hex) {
    this.history[0].captured.push(nhex)      // mark as unplayable for next turn
    this.removeStone(nhex)   // decrInfluence(nhex, nhex.color)
  }

  /**
   * See if proposed Move is legal; one of many potential Moves we likely won't make or explore.
   * @returns a Hex[] (of captured Hexes) if move is Legal, else return undefined
   */
  isLegalMove(hex: Hex, color: StoneColor): Hex[] {
    if (hex.stoneColor !== undefined) return undefined
    let move0 = this.history[0]
    let isCaptured = move0 && (move0.stoneColor !== color) && move0.captured.includes(hex)
    // true if nHex is unplayable because it was captured by other player's previous Move
    if (isCaptured) return undefined
    let pstats = this.gStats.pStat(color)
    if (hex.district == 0 && pstats.dMax <= pstats.dStones[0]) return undefined
    // get Captures THEN check Suicide:
    let move = new Move(hex, color, [])
    this.history.unshift(move)
    this.undoRecs.closeUndo().enableUndo()
    // addUndoRec(removeStone), incrInfluence [& undoInf] -> captureStone() -> undoRec(addStone & capMark)
    this.addStone(hex, color)     // stone on hexMap
    let suicide = hex.isAttack(otherColor(color)), rv = suicide ? undefined : move.captured
    this.undoRecs.closeUndo().pop()    // replace captured Stones/Colors & undo/redo Influence
    this.history.shift()
    this.undoCapMarks(move.captured);  // remove capMarks on move, re-assert capMarks on move0
    return rv
  }
}

/** GamePlayC is clone of original (which may have been GamePlay) downcast to GamePlay0 */
export class GamePlayC extends GamePlay0 {
  readonly original: GamePlay0
  constructor (original: GamePlay0) {
    super(original)
    this.original = original
  }
}

/** GamePlayD is compatible 'copy' with original, but does not share components */
export class GamePlayD extends GamePlay0 {
  readonly original: GamePlay0
  constructor (original: GamePlay0) {
    super()
    this.original = original
    
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
    KeyBinder.keyBinder.setKey('b', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('r', { thisArg: this, func: this.redoMove })
    KeyBinder.keyBinder.setKey('t', { thisArg: this, func: this.skipMove }) // next Turn
    KeyBinder.keyBinder.setKey('M-K', { thisArg: this, func: this.resignMove })// S-M-k
    KeyBinder.keyBinder.setKey('Escape', {thisArg: table, func: table.stopDragging}) // Escape
    KeyBinder.keyBinder.setKey('C-s', { thisArg: GameSetup.setup, func: GameSetup.setup.restart })// C-s START
    KeyBinder.keyBinder.setKey('C-c', { thisArg: this, func: this.stopPlan })// C-c Stop Planner
    KeyBinder.keyBinder.setKey('m', { thisArg: this, func: this.makeMove })
    KeyBinder.keyBinder.setKey('n', { thisArg: this, func: this.autoMove, argVal: false })
    KeyBinder.keyBinder.setKey('N', { thisArg: this, func: this.autoMove, argVal: true})
    KeyBinder.keyBinder.setKey('y', { thisArg: this, func: () => TP.yield = true })
    KeyBinder.keyBinder.setKey('u', { thisArg: this, func: () => TP.yield = false })
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
    table.skipShape.on(S.click, () => this.skipMove(), this)
  }
  maxPlys: number; maxBreadth: number
  stopPlan() {
    this.maxPlys = TP.maxPlys; this.maxBreadth = TP.maxBreadth
    TP.maxPlys = TP.maxBreadth = -1
    this.curPlayer.useRobo = this.otherPlayer(this.curPlayer).useRobo = false // if toggle then useRobo = !useRobo
    console.log(stime(this, `.stopPlan:`), { maxPlys: this.maxPlys, maxBreadth: this.maxBreadth }, '----------------------')
    setTimeout(() => {
      this.table.winText.text = `stopPlan maxPlys: ${this.maxPlys}, maxBreadth: ${this.maxBreadth}`
      this.table.hexMap.update()
    }, 400)
  }
  // Make ONE robo-move by curPlayer (more move if auto-move sets player.useRobo = true)
  makeMove() {
    if (TP.maxBreadth == -1) { TP.maxPlys = this.maxPlys; TP.maxBreadth = this.maxPlys }
    let running = this.curPlayer.planner.running
    console.log(stime(this, `.makeMove: ${this.curPlayer.colorn} useRobo=`), this.curPlayer.useRobo, `running=${running}` )
    if (!running)
      this.curPlayer.makeMove(this.table.nextHex.stone, true) // make one robo move
  }
  autoMove(useRobo: boolean = false) {
    let op = this.otherPlayer(this.curPlayer)
    this.curPlayer.useRobo = op.useRobo = useRobo // if toggle then useRobo = !useRobo
    console.log(stime(this, `.autoMove: ${this.curPlayer.colorn}.useRobo=`), this.curPlayer.useRobo)
    console.log(stime(this, `.autoMove: ${op.colorn}.useRobo=`), op.useRobo)
  }
  /** undo last undo block: with logging collapsed & hexMap.update() */
  undoStones() {
    let undoNdx = this.undoRecs.length -1;
    let popRec = (undoNdx >= 0) ? this.undoRecs[undoNdx].concat([]) : [] // copy undoRecs[] so it is stable in log
    console.groupCollapsed(`${stime(this)}:undoIt-${undoNdx}`)
    console.log(stime(this, `.undoStones: undoRec[${undoNdx}] =`), popRec);
    this.undoRecs.pop(); // remove/replace Stones
    console.log(stime(this, `.undoIt: after[${undoNdx}]`), { Stones: [].concat(this.hexMap.allStones), undo: this.undoRecs });
    console.groupEnd()   // "undoIt-ndx"
  }

  /** invoked by GUI or Keyboard */
  undoMove(undoTurn: boolean = true) {
    this.table.stopDragging() // drop on nextHex (no Move)
    let move: Move = this.history.shift() // remove last Move
    if (!!move) {
      this.redoMoves.unshift(move)  // redoMoves[0] == move0
      this.undoStones()             // remove last Stone, replace captures
      this.undoCapMarks(move.captured) // unmark
      if (undoTurn) {
        this.turnNumber -= 2        // will immediately increment to tn+1
        this.setNextPlayer()
      }
      let move0 = this.history[0]  // the new, latest 'move'
      if (!!move0) {
        move0.board.setRepCount(this.history) // undo: decrement repCount; because: shift()
      }
      this.gStats.update(move0)          // reset stats: inControl & score & repCount check for 'win'
    }
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
  override removeStone(hex: Hex2): void {
    let stoneId = hex.stoneIdText.text, color = hex.stoneColor
    this.addUndoRec(this, `${hex.Aname}.setStoneId(${stoneId})`, () => hex.setStoneId(stoneId))
    super.removeStone(hex)
    return
  }
  override addStone(hex: Hex2, stoneColor: StoneColor): void {
    super.addStone(hex, stoneColor)
    hex.setStoneId(this.history.length)
  }
  override captureStone(nhex: Hex): void {
    super.captureStone(nhex)
    nhex.markCapture()
  }
  /** also showMark for next redo: history[0].hex */
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
  override doPlayerSkip(hex: Hex, stoneColor: StoneColor) {
    // undo-skip: clear other Player's Stone from this.table.nextHex
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.nextHex.clearColor()) // undo-skip
  }
  override doPlayerResign(hex: Hex, stoneColor: StoneColor): void {
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.nextHex.clearColor()) // undo-resign
  }
  /** remove captured Stones, from placing Stone on Hex */
  override doPlayerMove(hex: Hex, color: StoneColor): StoneColor {
    let win = super.doPlayerMove(hex, color) // skipAndSet -> captureStone -> mark new Captures
    this.hexMap.update()
    if (win !== undefined) {
      // addStoneEvent will NOT invoke this.setNextPlayer()
      super.setNextPlayer()
      this.table.logCurPlayer(this.curPlayer) // log for next move, but do not PutButtonOnPlayer(curPlayer)
    }
    return win
  }
  override setNextPlayer(plyr?: Player): Player {
    super.setNextPlayer(plyr)
    this.hexMap.update()
    return this.table.setNextPlayer()
  }
  override endCurPlayer(): void {
    // IFF stone is [still] ON nextHex: Hex2.clearColor() 
    let nextHex = this.table.nextHex, nxtStone = nextHex.stone
    if (nxtStone?.parent) {     // NOTE: nextHex.xy are already rounded:
      if (Math.round(nxtStone.x) == nextHex.x && Math.round(nxtStone.y) == nextHex.y) {
        nextHex.clearColor()
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
    if (win === undefined) this.setNextPlayer()
    else this.endCurPlayer()
  }
  removeStoneEvent(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }
}

/** Historical record of each move made. */
export class Move {
  readonly Aname: string
  readonly hex: Hex // where to place stone
  readonly stoneColor: StoneColor
  readonly captured: Hex[] = [];
  board: Board
  constructor(hex: Hex, stoneColor: StoneColor, captured: Hex[] = []) {
    this.Aname = this.toString(hex, stoneColor) // for debugger..
    this.hex = hex
    this.stoneColor = stoneColor
    this.captured = captured
  }
  toString(hex = this.hex, stoneColor = this.stoneColor): string {
    let name = hex.Aname // Hex@[r,c] OR Hex@Skip OR hex@Resign
    return `${TP.colorScheme[stoneColor]}${name.substring(3)}`
  }
  bString(): string {
    let pid = stoneColors.indexOf(this.stoneColor) // when StoneColor is [0|1] simplify this!
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
  get colorn() {return TP.colorScheme[this.color]}
 
  constructor(index: number, color: StoneColor, gamePlay: GamePlay0) {
    this.index = index
    this.color = color
    this.name = `Player${index}-${this.colorn}`
    this.gamePlay = gamePlay
    this.planner = new Planner(gamePlay)
  }
  makeMove(stone: Stone, useRobo = false) {
    let table = (this.gamePlay instanceof GamePlay) && this.gamePlay.table
    if (useRobo || this.useRobo) this.planner.makeMove(stone, table)
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
}

class BoardRegister extends Map<string, Board> {
  /** as Board as Set */
  addBoard(move: Move, history: Move[]) {
    let bNew = new Board(move) // calc board.id
    let board: Board = this.get(bNew.id) // find if previous instance of identical Board
    if (!board) {
      this.set(bNew.id, bNew)     // Note: boards are never removed, even by undo; just decr repCount
      board = bNew
    }
    move.board = board
    board.setRepCount(history)    // count how many times canonical board appears in history
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
  readonly id: string = ""   // to identify hexMap state
  readonly history: Move[]   // to recreate hexMap state
  readonly hexStones: HSC[]  // to recreate hexMap state [without sequence info]
  readonly captured: Hex[]   // captured by current Players's Move
  readonly nextPlayerColor: StoneColor // cannot play into captured Hexes
  readonly resigned: StoneColor;   // set to color of Player who resigns to signal end of game.
  repCount: number = 1;

  /**
   * Record the current state of the game.
   * @param nextPlayerColor identify Player to make next Move (player.color, table.getPlayer(color))
   * @param move Move: resigned & captured: not available for play by next Player
   * @param hexMap supplies board.allStones: HSC[]
   */
  constructor(move: Move) {
    this.nextPlayerColor = otherColor(move.stoneColor)
    this.resigned = (move.hex.Aname === S_Resign) ? move.stoneColor : undefined // keyboard: 'M-K'
    this.hexStones = [].concat(move.hex.map.allStones)
    this.id = this.idString(move)
  }
  toString() { return `${this.id}#${this.repCount}` }
  idString(move: Move) {
    let id = this.cString(this.nextPlayerColor, move.captured) + (this.resigned ? move.Aname : '')
    let nCol = move.hex.map.nCol
    this.hexStones.sort((a, b) => { return (a.hex.row - b.hex.row) * nCol + (a.hex.col - b.hex.col) });
    this.hexStones.forEach(hsc => id += this.bString(hsc)) // in canonical order
    return id
  }
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
}
