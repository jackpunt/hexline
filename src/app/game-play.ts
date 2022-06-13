import { H } from "./hex-intfs";
import { AT, json } from "@thegraid/common-lib"
import { Hex, Hex2, HexMap, S_Resign, HSC, HexMaps, IHex } from "./hex";
import { HexEvent } from "./hex-event";
import { S, stime, Undo, KeyBinder } from "@thegraid/easeljs-lib";
import { GameStats, TableStats, WINARY } from "./stats";
import { Table } from "./table";
import { otherColor, StoneColor, stoneColors, TP} from "./table-params"
import { Player } from "./player";
import { GameSetup } from "./game-setup";
import { Move } from "./move";
import { LogReader, LogWriter } from "./stream-writer";

export class GamePlay0 {
  static gpid = 0
  readonly id = GamePlay0.gpid++

  constructor() {
    this.gStats = new GameStats(this.hexMap) // AFTER allPlayers are defined so can set pStats
  }

  readonly hexMap: HexMaps = new HexMap()
  readonly history: Move[] = []          // sequence of Move that bring board to its state
  readonly redoMoves: Move[] = []
  readonly allBoards = new BoardRegister()
  readonly gStats: GameStats       // 'readonly' (set once by clone constructor)
  get iHistory() { return this.history.map(move => move.toIMove) }
  
  newMoveFunc: (hex: Hex, sc: StoneColor, caps: Hex[], gp: GamePlay0) => Move 
  newMove(hex: Hex, sc: StoneColor, caps: Hex[], gp: GamePlay0) {
    return this.newMoveFunc? this.newMoveFunc(hex,sc, caps, gp) : new Move(hex, sc, caps, gp)
  }
  undoRecs: Undo = new Undo().enableUndo();
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) { 
    this.undoRecs.addUndoRec(obj, name, value); 
  }  

  /** compute Board.id _after_ addStone sets move.captures */
  get boardId(): [string, StoneColor] {
    let move0 = this.history[0], sc = move0.stoneColor
    let resign_sc = (move0.hex.Aname === S_Resign) ? sc : undefined, caps = ''
    move0.captured.forEach(hex => caps += hex.rcs)// [r,c] of each capture
    let id = `Board(${sc},${caps})${resign_sc ? `${resign_sc}!` : ''}`
    let hexStones = this.hexMap.allStones.filter(({hex}) => hex.row >= 0)   // skip does not change board
    let bString = (hsc: HSC) => { return `${hsc.sc}${hsc.hex.rcs}` } // sc[r,c] for each occupied hex
    hexStones.sort((a, b) => { return a.hex.rc_linear - b.hex.rc_linear }); // ascending row-major
    hexStones.forEach(hsc => id += bString(hsc)) // in canonical order
    return [id, resign_sc]
  }
  /** after addStone: update repCount and set move.board */
  incrBoard(move: Move) {
    let [boardId, resign_sc] = this.boardId
    let board = this.allBoards.get(boardId)// find if previous instance of identical Board
    if (!board) {
      board = new Board(boardId, resign_sc)
      this.allBoards.set(boardId, board) // repCount = 1
    } else {
      board.repCount += 1
    }
    //board.setRepCount(this.history)    // count how many times canonical board appears in history
    return move.board = board
  }
  decrBoard(move = this.history[0]) {
    let board = this.allBoards.get(move.board.id)
    if (board.repCount > 0) board.repCount-- // board.setRepCount(this.history)
    // else this.allBoards.delete(board.id)
    // board.setRepCount(this.history)
  }

  unshiftMove(move: Move) {
    this.history.unshift(move)
    this.incrBoard(move)
  }
  shiftMove(): Move {
    let move = this.history.shift()
    if (move !== undefined) this.decrBoard(move)
    return move
  }
  /** addStone to setStone(hex)->hex.setStone(color); assertInfluence & Captured; addUndoRec (no stats) */
  addStone(hex: Hex, stoneColor: StoneColor) {
    let rv = hex
    if (hex.row !== -1) {                   // skipHex || resignHex do not have color or influence.
      rv = hex.setColor(stoneColor)         // move Stone onto Hex & HexMap [hex.stone = stone]
      this.gStats.afterSetColor(hex)
      this.incrInfluence(hex, stoneColor)
    }
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stoneColor})`, () => this.removeStone(hex)) // remove for undo
      if (hex.isAttack(otherColor(stoneColor))) this.removeStone(hex) // legalSuicide --> clearColor
    }
    return rv
  }
  /** 
   * capture [or undoMove->isUndoing]
   * remove Move/HSC from map
   * remove stone Shape from hex
   * remove all influence of color on each axis from Hex
   * assert influence of color on each axis from Hex (w/o stone on hex)
   */
  removeStone(hex: Hex) {
    if (hex.row !== -1) {                        // skipHex and resignHex have no influence
      this.gStats.beforeClearColor(hex)          // adjust dStones & dMax
      let stoneColor = hex.clearColor()          // Hex2.stone = undefined; remove HSC from allStones
      this.decrInfluence(hex, stoneColor)        // adjust influence from removed Stone
      if (!this.undoRecs.isUndoing) {
        this.addUndoRec(this, `undoRemove(${hex.Aname}:${stoneColor})`, () => this.readdStone(hex, stoneColor)) // undoRemove
      }
    }
  }
  /** undo capture; this is not a Move */
  readdStone(hex: Hex, stoneColor: StoneColor) {
    if (hex.stoneColor !== undefined) 
      console.log(stime(this, `.readdStone: hex occupied: ${hex.stoneColor}, trying to [re-]addStone: ${stoneColor}`))
    this.addStone(hex, stoneColor) // ASSERT: produces no captures
  }


  doPlayerSkip(hex: Hex, stoneColor: StoneColor) {  }  // doPlayerMove records history; override sets undoSkip 
  doPlayerResign(hex: Hex, stoneColor: StoneColor) { } // doPlayerMove records history

  /** remove captured Stones, from placing Stone on Hex */
  doPlayerMove(hex: Hex, stoneColor: StoneColor): StoneColor {
    let move0 = this.newMove(hex, stoneColor, [], this) // new Move(); addStone(); incrBoard(); updateStates()
    if (hex == this.hexMap.skipHex) {      // or: hex.Aname == S_skip
      this.doPlayerSkip(hex, stoneColor)
    } else if (hex == this.hexMap.resignHex) {
      this.doPlayerResign(hex, stoneColor) // incrBoard will detect // TODO: maybe need to ensure setNextPlayer?
    } else {
      this.addStone(hex, stoneColor) // add Stone and Capture (& removeStone) w/addUndoRec
      move0.suicide = !hex.stoneColor
      //if (move0.suicide) console.log(AT.ansiText(['red', 'bold'], `suicide: move0`), move0)
      if (move0.suicide && !TP.allowSuicide) {
        console.warn(stime(this, `.doPlayerMove: suicidal move: ${move0.Aname}`), { hex, color: TP.colorScheme[stoneColor] })
        debugger; // illegal suicide
      }
    }
    this.undoRecs.closeUndo()         // expect ONE record, although GUI can pop as many as necessary
    let board = this.incrBoard(move0) // set move0.board && board.repCount
    let [win] = this.gStats.updateStats(board) // check for WIN: showRepCount(), showWin()
    return win
  }
  
  /** after add Stone to hex: propagate influence in each direction; maybe capture. */
  incrInfluence(hex: Hex, color: StoneColor) {
    H.infDirs.forEach(dn => {
      let inc = hex.getInf(color, dn)         // because hex.stone: hex gets +1, and passes that on
      hex.propagateIncr(color, dn, inc, (hexi) => {
        if (hexi != hex && hexi.isCapture(color)) {  // pick up suicide later... (hexi != hex <== curHex)
          this.captureStone(hexi)               // capture Stone of *other* color
        }
      })
    })
  }

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
  /** used for diagnosing undoRecs. */
  logUndoRecs(ident: string, move: Move) {
    TP.log > 1 && console.log(stime(this, ident), { 
      movedepth: this.history.length+1, 
      //hex12_color: this.hexMap[1][2].stoneColor ? this.hexMap[1][2].stoneColor : ' ', 
      move, Aname: move?.Aname || '',
      undoRecs: this.undoRecs.concat(), 
      undoLast: this.undoRecs[this.undoRecs.length-1]?.concat(), 
      openRec: this.undoRecs.openRec.concat(), })
  }
  /**
   * See if proposed Move is legal, and if it is suicide (when suicide is legal)
   * 
   * unshift(move); addStone(); isSuicide(); undo(); shift()
   * @param evalFun if false then leave protoMove in place; if function invoke evalFun(move)
   * @returns [isLegal, isSuicide]
   */
  isMoveLegal(hex: Hex, color: StoneColor, evalFun: (boolean | ((move: Move) => void)) = true): [boolean, boolean] {
    if (hex.stoneColor !== undefined) return [false, false]
    let move0 = this.history[0]
    // true if nHex is unplayable because it was captured by other player's previous Move
    // Note if dragShift: (move0.stoneColor === color )
    let hexBlocked = move0 && (move0.stoneColor !== color) && move0.captured.includes(hex)
    if (hexBlocked) return [false, false]
    let pstats = this.gStats.pStat(color)
    if (hex.district == 0 && pstats.dMax <= pstats.dStones[0]) return [false, false]
    let move: Move = this.doProtoMove(hex, color)
    let suicide = move.suicide
    let legal = !suicide || (TP.allowSuicide && move.captured.length > 0 )
    if (legal) {
      if (evalFun === false) return [legal, suicide]
      if (typeof evalFun === 'function') evalFun(move) // history[0] = move; Stone on hex
    }
    this.undoProtoMove()
    return [legal, suicide]
  }
  // similar to Planner.placeStone/unplaceStone, but with alt color for CapMarks
  doProtoMove(hex: Hex, color: StoneColor) {
    let move = this.newMove(hex, color, [], this)
    this.undoRecs.saveUndo(`iLM`).enableUndo() // before addStone in isLegalMove
    let capColor = Hex.capColor   // dynamic bind Hex.capColor
    Hex.capColor = H.capColor2
    // addUndoRec(removeStone), incrInfluence [& undoInf] -> captureStone() -> undoRec(addStone & capMark)
    this.addStone(hex, color)     // stone on hexMap: exactly 1 undoRec (have have several undo-funcs)
    move.suicide = !hex.stoneColor
    Hex.capColor = capColor
    this.incrBoard(move)          // set move.board
    return move
  }
  undoProtoMove() {
    this.undoRecs.closeUndo().restoreUndo()    // replace captured Stones/Colors & undo/redo Influence
    this.shiftMove()
  }
  /** undoRecs.pop(): with logging collapsed */
  undoStones() {
    let undoNdx = this.undoRecs.length - 1
    let popRec = (undoNdx >= 0) ? this.undoRecs[undoNdx].concat() : [] // copy undoRecs[] so it is stable in log
    if (TP.log > -1) {
      console.groupCollapsed(`${stime(this)}:undoIt-${undoNdx}`)
      console.log(stime(this, `.undoStones: undoRec[${undoNdx}] =`), popRec);
    }
    this.undoRecs.pop(); // remove/replace Stones
    if (TP.log > -1) {
      console.log(stime(this, `.undoIt: after[${undoNdx}]`), { allHSC: this.hexMap.allStones.concat(), undo: this.undoRecs });
      console.groupEnd()   // "undoIt-ndx"
    }
  }
}

/** GamePlayD is compatible 'copy' with original, but does not share components */
export class GamePlayD extends GamePlay0 {
  override hexMap: HexMaps;
  constructor(mh: number, nh: number) {
    super()
    this.hexMap[S.Aname] = `GamePlayD#${this.id}`
    this.hexMap.makeAllDistricts(mh, nh)
    return
  }
}
export type Progress = { b?: number, tsec?: number|string, tn?: number}
class ProgressLogWriter extends LogWriter {
  onProgress: (progress: Progress) => void = (progress) => {}
  override writeLine(text?: string): void {
      if (text.endsWith('*progress*')) {
        // show progress
        let str = text.split('#')[0]
        let pv = JSON.parse(str) as Progress
        this.onProgress(pv)
      } else {
        super.writeLine(text)
      }
  }
}

/** implement the game logic */
export class GamePlay extends GamePlay0 {
  readonly logWriter: ProgressLogWriter
  readonly table: Table
  override readonly gStats: TableStats
  constructor(table: Table) {
    super()            // hexMap, history, gStats...
    let time = stime('').substring(6,15), size=`${TP.mHexes}x${TP.nHexes}`
    let line = {time: stime.fs(), mh: TP.mHexes, nh: TP.nHexes, maxBreadth: TP.maxBreadth, 
      maxPlys: TP.maxPlys, nPerDist: TP.nPerDist, pBoards: TP.pBoards, pMoves: TP.pMoves, pWeight: TP.pWeight}
    let line0 = json(line, false)
    let logFile = `log${size}_${time}`
    console.log(stime(this, `.startup: -------------- New Game: ${line0} --------------`))
    this.logWriter = new ProgressLogWriter(logFile)
    this.logWriter.writeLine(line0)
    this.logWriter.onProgress = (progress) =>{ 
      this.table.progressMarker[this.curPlayer.color].update(progress)
    }
    this.allPlayers = stoneColors.map((color, ndx) => new Player(ndx, color, table))
    // setTable(table)
    this.table = table
    this.gStats = new TableStats(this, table) // reset gStats AFTER allPlayers are defined so can set pStats
    let roboPause = (p = this.curPlayer) => { p.planner?.pause(); this.table.nextHex.markCapture(); this.hexMap.update(); console.log("Paused") }
    let roboResume = (p = this.curPlayer) => { p.planner?.resume(); this.table.nextHex.unmarkCapture(); this.hexMap.update(); console.log("Resume") }
    let roboStep = () => { 
      let p = this.curPlayer, op = this.otherPlayer(p)
      roboPause(op); roboResume(p);
    }
    let roboStep2 = () => { roboResume(); setTimeout(() => roboPause(), 2) }
    KeyBinder.keyBinder.setKey('p', { thisArg: this, func: roboPause })
    KeyBinder.keyBinder.setKey('r', { thisArg: this, func: roboResume })
    KeyBinder.keyBinder.setKey('s', { thisArg: this, func: roboStep })
    KeyBinder.keyBinder.setKey('q', { thisArg: this, func: this.readerStop })
    KeyBinder.keyBinder.setKey(/1-9/, { thisArg: this, func: (e: string) => { TP.maxBreadth = Number.parseInt(e) } })

    KeyBinder.keyBinder.setKey('M-z', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('b', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('f', { thisArg: this, func: this.redoMove })
    KeyBinder.keyBinder.setKey('S', { thisArg: this, func: this.skipMove })
    KeyBinder.keyBinder.setKey('M-K', { thisArg: this, func: this.resignMove })// S-M-k
    KeyBinder.keyBinder.setKey('Escape', {thisArg: table, func: table.stopDragging}) // Escape
    KeyBinder.keyBinder.setKey('C-s', { thisArg: GameSetup.setup, func: () => {GameSetup.setup.restart()} })// C-s START
    KeyBinder.keyBinder.setKey('C-c', { thisArg: this, func: this.stopPlayer })// C-c Stop Planner
    KeyBinder.keyBinder.setKey('m', { thisArg: this, func: this.makeMove, argVal: true })
    KeyBinder.keyBinder.setKey('M', { thisArg: this, func: this.makeMoveAgain, argVal: true })
    KeyBinder.keyBinder.setKey('n', { thisArg: this, func: this.autoMove, argVal: false })
    KeyBinder.keyBinder.setKey('N', { thisArg: this, func: this.autoMove, argVal: true})
    KeyBinder.keyBinder.setKey('y', { thisArg: this, func: () => TP.yield = true })
    KeyBinder.keyBinder.setKey('u', { thisArg: this, func: () => TP.yield = false })
    KeyBinder.keyBinder.setKey('l', { thisArg: this.logWriter, func: this.logWriter.pickLogFile })
    KeyBinder.keyBinder.setKey('L', { thisArg: this.logWriter, func: this.logWriter.showBacklog })
    KeyBinder.keyBinder.setKey('M-l', { thisArg: this.logWriter, func: () => { this.logWriter.closeFile() } }) // void vs Promise<void>
    KeyBinder.keyBinder.setKey('C-l', { thisArg: this, func: () => { this.readGameFile() } }) // void vs Promise<void>
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
    table.skipShape.on(S.click, () => this.skipMove(), this)
  }

  turnNumber: number = 0    // = history.lenth + 1 [by this.setNextPlayer] 

  readonly allPlayers: Player[];
  curPlayer: Player;
  getPlayer(color: StoneColor): Player {
    return this.allPlayers.find(p => p.color == color)
  }

  otherPlayer(plyr: Player = this.curPlayer) { return this.getPlayer(otherColor(plyr.color))}

  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }
  setNextPlayer0(plyr = this.otherPlayer()): Player {
    if (plyr != this.curPlayer) this.endCurPlayer() // clean up nextHex on undo/skip/redo...
    this.turnNumber = this.history.length + 1
    return this.curPlayer = plyr
  }
  endCurPlayer0() {}

  /** tell [robo-]Player to stop thinking and make their Move; also set useRobo = false */
  stopPlayer() {
    this.autoMove(false)
    this.curPlayer.stopMove()
    console.log(stime(this, `.stopPlan:`), { planner: this.curPlayer.planner }, '----------------------')
    setTimeout(() => {
      this.table.winText.text = `stopPlan:`
      this.table.hexMap.update()
    }, 400)
  }
  makeMoveAgain(arg?: boolean, ev?: any) {
    this.undoMove()
    this.makeMove(true, 1)
  }
  /** provoke Player (GUI or Planner) to respond with addStoneEvent */
  makeMove(auto?: boolean, ev?: any, incb = 0) {
    let sc = this.table.nextHex.stone.color
    let player = (this.turnNumber > 1) ? this.curPlayer : this.otherPlayer(this.curPlayer)
    if (auto === undefined) auto = player.useRobo
    player.playerMove(sc, auto, incb) // make one robo move
  }
  /** if useRobo == true, then Player delegates to robo-player immediately. */
  autoMove(useRobo: boolean = false) {
    this.forEachPlayer(p => {
      p.useRobo = useRobo
      console.log(stime(this, `.autoMove: ${p.colorn}.useRobo=`), p.useRobo)
    })
  }

  /** invoked by GUI or Keyboard */
  undoMove(undoTurn: boolean = true) {
    this.table.stopDragging() // drop on nextHex (no Move)
    let move: Move = this.shiftMove() // remove last Move
    if (!!move) {
      let history = this.history
      this.redoMoves.unshift(move)  // redoMoves[0] == move0
      this.undoStones()             // remove last Stone, replace captures
      this.undoCapMarks(move.captured) // unmark
      move.board.setRepCount(history)
      if (undoTurn) {
        this.setNextPlayer()
      }
      let move0 = this.history[0]  // the new, latest 'move'
      if (!!move0) {
        move0.board.setRepCount(history) // undo: decrement repCount; because: shift()
      }
      this.gStats.updateStats(move0?.board)   // reset stats: inControl & score & repCount check for 'win'
      let n = history.length, n1 = (n+1).toString().padStart(3), n0 = n.toString().padStart(3)
      this.logWriter.writeLine(`{"p":"${move.stoneColor}", "undo": ${n+1} }#${n1} ${move.Aname} -> #${n0} ${move0?.Aname||'[0]'}`)
    }
    this.showRedoMark()
    this.hexMap.update()
  }
  redoMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
    let move = this.redoMoves[0]// addStoneEvent will .shift() it off
    if (!move) return
    this.table.doTableMove({row: move.hex.row, col: move.hex.col, Aname: move.hex.Aname}, move.stoneColor)
    this.showRedoMark()
    this.hexMap.update()
  }
  showRedoMark(hex: IHex | Hex = this.redoMoves[0]?.hex) {
    if (!!hex) { // unless Skip or Resign...
      this.hexMap.showMark((hex instanceof Hex) ? hex : Hex.ofMap(hex, this.hexMap))
    }    
  }
  /** addUndoRec to [re-]setStoneId() */
  override removeStone(hex: Hex2): void {
    let stoneId = hex.stoneIdText.text
    this.addUndoRec(this, `${hex.Aname}.setStoneId(${stoneId})`, () => hex.setStoneId(stoneId))
    super.removeStone(hex)
    return
  }
  override addStone(hex: Hex2, stoneColor: StoneColor) {
    let rv = super.addStone(hex, stoneColor)
    if (!!hex.stoneColor) hex.setStoneId(this.history.length)
    return rv
  }
  override captureStone(nhex: Hex2): void {
    super.captureStone(nhex)
    nhex.markCapture()
    this.addUndoRec(nhex, `hex.unmarkCapture()`, () => nhex.unmarkCapture())
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
    super.doPlayerSkip(hex, stoneColor)
    // undo-skip: clear other Player's Stone from this.table.nextHex
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.nextHex.clearColor()) // undo-skip
  }
  override doPlayerResign(hex: Hex, stoneColor: StoneColor): void {
    super.doPlayerResign(hex, stoneColor)
    this.addUndoRec(this.table, 'clearNextHex', () => this.table.nextHex.clearColor()) // undo-resign
  }
  /** unmarkCapture (& capMarks if Hex2), reset current capture to history[0] */
  /** also showMark for next redo: history[0].hex */
  undoCapMarks(captured: Hex[]) {
    captured.forEach(hex => (hex as Hex2).unmarkCapture())
    this.history[0]?.captured.forEach(hex => (hex as Hex2).markCapture())
    if (this.history[0]) this.hexMap.showMark(this.history[0].hex)
  }
  unmarkOldCaptures() { // when doPlayerMove()
    this.history[0]?.captured.forEach(hex => (hex as Hex2).unmarkCapture())
  }

  /** remove captured Stones, from placing Stone on Hex */
  override doPlayerMove(hex: Hex, color: StoneColor): StoneColor {
    this.unmarkOldCaptures()                 // this player no longer constrained
    let win = super.doPlayerMove(hex, color) // incrInfluence -> captureStone -> mark new Captures, closeUndo
    this.hexMap.update()
    if (win !== undefined) {
      this.autoMove(false)  // disable robots
    }
    return win
  }
  setNextPlayer(plyr?: Player) {
    this.setNextPlayer0(plyr)
    this.hexMap.update()
    this.curPlayer.planner.waitPaused().then(() => {
      this.table.setNextPlayer()
    })
  }
  endCurPlayer(): void {
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
    this.doPlayerMove(hev.hex, hev.stoneColor)
    this.setNextPlayer()
  }
  removeStoneEvent(hev: HexEvent) {
    throw new Error("Method not implemented.");
  }

  readerStop() {
    this.readerBreak = true
    this.curPlayer.planner.resume()
  }
  readerBreak = false
  async readGameFile(delay = 4) {
    let logReader = new LogReader()
    let filep = logReader.pickFileToRead()
    let file = await filep
    console.log(stime(this, `.readGameFile: File =`), file.name)
    let gameString = await logReader.readPickedFile(filep) // the WHOLE file contents!
    let lineAry = gameString.split('\n')
    let header = JSON.parse(lineAry.shift())
    console.log(stime(this, `.readGameFile: header =`), header)
    let { time, mh, nh, maxBreadth, maxPlys, nPerDist, pBoards } = header
    let gamePlay = GameSetup.setup.restart(mh, nh)  // NEW GamePlay: new LogWriter()
    gamePlay.runGameFromLog(lineAry, delay)
  }
  async runGameFromLog(lineAry: string[], delay = 0) {
    this.readerBreak = false
    this.curPlayer.planner.pause() // start paused!
    for (let line of lineAry) {
      if (line.length < 3) continue
      let str = line.split('#')[0]
      console.log(`move=`, str)
      let { undo, r, c, p } = JSON.parse(str) as { undo?: number, r?: number, c?: number, p: StoneColor }

      if (delay > 0) await new Promise((ok) => setTimeout(ok, delay));
      if (undo != undefined) {
        this.showRedoMark(this.history[0]?.hex); this.hexMap.update()
        await this.curPlayer.planner.waitPaused()
        if (this.readerBreak) return
        this.undoMove()
      } else {
        let ihex = {row: r, col: c, Aname: Hex.aname(r,c)} as IHex
        this.showRedoMark(ihex); this.hexMap.update()
        await this.curPlayer.planner.waitPaused()
        if (this.readerBreak) return
        this.table.doTableMove(ihex, p)
      }
    }
  }
}

/** a uniquifying 'symbol table' of Board.id */
class BoardRegister extends Map<string, Board> {}
/** Identify state of HexMap by itemizing all the extant Stones 
 * id: string = Board(nextPlayer.color, captured)resigned?, allStones
 * resigned: StoneColor
 * repCount: number
 */
export class Board {
  readonly id: string = ""   // Board(nextPlayer,captured[])Resigned?,Stones[]
  readonly resigned: StoneColor //
  repCount: number = 1;
  winAry: WINARY

  /**
   * Record the current state of the game: {Stones, turn, captures}
   * @param move Move: color, resigned & captured [not available for play by next Player]
   */
  constructor(id: string, resigned: StoneColor) {
    this.resigned = resigned
    this.id = id
  }
  toString() { return `${this.id}#${this.repCount}` }

  setRepCount(history: Move[]) {
    return this.repCount = history.filter(hmove => hmove.board === this).length
  }
  get signature() { return `[${TP.mHexes}x${TP.nHexes}]${this.id}` }
}
