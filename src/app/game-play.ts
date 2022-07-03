import { H } from "./hex-intfs";
import { AT, json } from "@thegraid/common-lib"
import { Hex, Hex2, HexMap, S_Resign, HSC, IHex } from "./hex";
import { HexEvent } from "./hex-event";
import { S, stime, Undo, KeyBinder, ParamGUI } from "@thegraid/easeljs-lib";
import { GameStats, TableStats, WINARY } from "./stats";
import { Table } from "./table";
import { otherColor, StoneColor, stoneColors, TP} from "./table-params"
import { Player } from "./player";
import { GameSetup } from "./game-setup";
import { IMove, Move } from "./move";
import { LogReader, LogWriter } from "./stream-writer";
import { Planner } from "./planner";
import { HgClient, HgReferee, newHgReferee,  } from "./HgClient";
import { CgMessage, CgType, CLOSE_CODE, DataBuf } from "@thegraid/wspbclient";
import { HgMessage, HgType } from "src/proto/HgProto";
export class GamePlay0 {
  static gpid = 0
  readonly id = GamePlay0.gpid++

  constructor() {
    this.gStats = new GameStats(this.hexMap) // AFTER allPlayers are defined so can set pStats
  }

  readonly hexMap: HexMap = new HexMap()
  readonly history: Move[] = []          // sequence of Move that bring board to its state
  readonly redoMoves: IMove[] = []
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

  /** history.unshift() & incrBoard(move) */
  unshiftMove(move: Move) {
    this.history.unshift(move)
    this.incrBoard(move)
  }
  /** history.shift() & decrBoard(move) */
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
      this.gStats.adjDistrict(hex, stoneColor) // adjust dStones & dMax (+1)
      this.incrInfluence(hex, stoneColor)
    }
    if (!this.undoRecs.isUndoing) {
      this.addUndoRec(this, `removeStone(${hex.Aname}:${stoneColor})`, () => this.removeStone(hex)) // remove for undo
      if (hex.isAttack(otherColor(stoneColor))) this.removeStone(hex) // legalSuicide --> clearColor
    }
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
      let stoneColor = hex.clearColor()          // Hex2.stone = undefined; remove HSC from allStones
      this.gStats.adjDistrict(hex, stoneColor)   // adjust dStones & dMax (-1)
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
    this.addStone(hex, stoneColor) // ASSERT: produces no captures [Move(hex) did caps in prior turn]
  }


  /** remove captured Stones, from placing Stone on Hex */
  doPlayerMove(hex: Hex, stoneColor: StoneColor): StoneColor {
    let move0 = this.newMove(hex, stoneColor, [], this) // new Move(); addStone(); incrBoard(); updateStates()
    if (hex.row >= 0) {
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
  undoStones(logIt = TP.log > -1) {
    let undoNdx = this.undoRecs.length - 1
    let popRec = (undoNdx >= 0) ? this.undoRecs[undoNdx].concat() : [] // copy undoRecs[] so it is stable in log
    if (logIt) {
      console.groupCollapsed(`${stime(this)}:undoIt-${undoNdx}`)
      console.log(stime(this, `.undoStones: undoRec[${undoNdx}] =`), popRec);
    }
    this.undoRecs.pop(); // remove/replace Stones
    if (logIt) {
      console.log(stime(this, `.undoIt: after[${undoNdx}]`), { allHSC: this.hexMap.allStones.concat(), undo: this.undoRecs });
      console.groupEnd()   // "undoIt-ndx"
    }
  }
}

/** GamePlayD is compatible 'copy' with original, but does not share components */
export class GamePlayD extends GamePlay0 {
  //override hexMap: HexMaps = new HexMap();
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
  declare readonly gStats: TableStats // https://github.com/TypeStrong/typedoc/issues/1597
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
    this.bindKeys()
  }
  bindKeys() {
    let table = this.table
    let roboPause = () => { this.forEachPlayer(p => this.pauseGame(p) )}
    let roboResume = () => { this.forEachPlayer(p => this.resumeGame(p) )}
    let roboStep = () => { 
      let p = this.curPlayer, op = this.otherPlayer(p)
      this.pauseGame(op); this.resumeGame(p);
    }
    KeyBinder.keyBinder.setKey('p', { thisArg: this, func: roboPause })
    KeyBinder.keyBinder.setKey('r', { thisArg: this, func: roboResume })
    KeyBinder.keyBinder.setKey('s', { thisArg: this, func: roboStep })
    KeyBinder.keyBinder.setKey('R', { thisArg: this, func: () => this.runRedo = true })
    KeyBinder.keyBinder.setKey('q', { thisArg: this, func: () => this.runRedo = false })
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
    KeyBinder.keyBinder.setKey('w', { thisArg: this, func: () => { this.gStats.showWinText() } })
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

  hgClient: HgClient
  /**
   * connect to CgServer(HgProto) for a network game.
   */
  network(ref: boolean, paramGUI: ParamGUI) {
    let nameByClientId = ["Referee", "Alice", "Bob", "Charlie", "Doris"];
    let group = TP.networkGroup, url = TP.networkUrl
    // invoked after [a] referee has joined the game
    let join_game_as_player = (ack: CgMessage, hgClient: HgClient) => {
      let client_id = hgClient.client_id // 0 = ref; 1, 2, ... for other player/observers
      let name = nameByClientId[client_id]
      console.log(stime(this, ".network join_game_as_player: start"), { name, client_id, ack })
      // send join_game request to Referee {client_id: 0}; handle the subsequent join message
      let hgJoinP = hgClient.sendAndReceive(() => hgClient.send_join(name),
        // predicate: indicating join by player/name 
        (msg) => (msg && msg.type == HgType.join && msg.name == name))
      hgJoinP.then(
        // like a 'once' Listener; in addition to CgClient.eval_join:
        (msg) => {
          let player_id = hgClient.player_id = msg.player // set player_id as assigned by referee
          console.log(stime(this, ".network join_game_as_player: joined"), { name, player_id, msg })
          if (hgClient.isPlayer) {
            let player = this.allPlayers[player_id]
            paramGUI.selectValue("PlayerId", player_id) // dubious... may need > 1 of these [multi-choice]
            hgClient.player = player                // indicate isNetworked(player); ggClient.localPlayer += player
            this.setNextPlayer(player)  // ndx & putButtonOnPlayer
          }
        }, (reason) => {
          console.warn(stime(this, `.join_game_as_player: join failed:`), reason)
        })
    }
    // onOpen: attach player to this.table & GUI [also for standalone Referee]
    let cgOpen = (hgClient: HgClient) => {
      paramGUI.selectValue("Network", ref ? "ref" : "cnx")
      //hgClient.attachToGUI(this.table)
      hgClient.addEventListener('close', (ev: CloseEvent) => {
        paramGUI.selectValue("Network", " ")
        paramGUI.selectValue("PlayerId", " ")
      })
    }
    let initPlyrClient = (url: string, onOpen: (hgClient: HgClient) => void) => {
      // connectStack; then onOpen(hgClient); maybeMakeRef; join_game
      this.hgClient = new HgClient(url, (hgClient) => {
        onOpen(hgClient)
        hgClient.wsbase.log = 0
        hgClient.cgBase.log = 0
        hgClient.log = 0
        hgClient.cgBase.send_join(group).then((ack: CgMessage) => {
          console.log(stime(this, `.network CgJoin(${group}) ack:`), 
            { success: ack.success, client_id: ack.client_id, hgCid: hgClient.client_id, hgClient, ack })
          if (!ack.success) return        // did not join Client-Group!
          if (ack.client_id === 0) return // asked for Referee connection and got it!
          // joined ClientGroup with cgBase.client_id; try make a Referee, then join_game as player
          if (ack.cause === "auto-approve") {
            this.makeRefJoinGroup(url, group, ack => join_game_as_player(ack, hgClient))
          } else {
            join_game_as_player(ack, hgClient)
          }
        })
      })
    }
    let initRefClient = (url: string, onOpen: (hgClient: HgClient) => void) => {
      this.hgClient = newHgReferee(undefined, ((refClient: HgReferee) => {
        refClient.wsbase.log = 0
        refClient.cgBase.log = 0
        refClient.log = 1
      })).joinGroup(url, group, onOpen) // explicit refClient
    }
    // client for GUI connection to GgServer:
    (ref ? initRefClient : initPlyrClient).call(this, url, cgOpen)
  }
  closeNetwork() {
    let closeMe = (hgClient: HgClient) => { 
      hgClient.closeStream(CLOSE_CODE.NormalClosure, "GUI -> no")
    }
    this.isNetworked(closeMe, true)
  }
  /**
   * execute code when network is being used:
   * 
   * isReferee can return false or true, so application can proceed as networked or standalone.
   * 
   * if notCurPlayer === undefined do NOTHING; if === true, use isCurPlayer
   * 
   * If isReferee === undefined, treat same as notCurPlayer, return true.
   * 
   * @param isCurPlayer invoked if hgClient is running curPlayer
   * @param notCurPlayer invoked if hgClient is NOT running curPlayer [true: use isCurPlayer()]
   * @param isReferee invoked if hgClient is running as Referee (false | return false: isNetworked->false)
   * @returns false if Table is running StandAlone (or referee...)
   */
  isNetworked(isCurPlayer?: (hgClient?: HgClient) => void,
    notCurPlayer?: true | ((hgClient?: HgClient) => void), 
    isReferee?: false | ((refClient?: HgClient) => boolean)): boolean {
    if (!this.hgClient?.isOpen) return false    // running in standalone browser mode
    // if isReferee is not supplied: use otherPlayer(); but return true
    let otherPlayer = (notCurPlayer === true) ? isCurPlayer : notCurPlayer // can be undefined
    let asReferee = (isReferee !== undefined) ? isReferee
      : (otherPlayer !== undefined) ? (hgc: HgClient) => { otherPlayer(hgc); return true } : true
    if (this.hgClient.client_id === 0) {
      return typeof asReferee === 'function' ? asReferee(this.hgClient) : asReferee // hgClient is running as Referee
    } else if (this.hgClient.player == this.curPlayer) {
      !!isCurPlayer && isCurPlayer(this.hgClient) // hgClient is running the curPlayer
    } else {
      !!otherPlayer && otherPlayer(this.hgClient) // hgClient is not running curPlayer
    }
    return true   // isNetworked: has an Open HgClient
  }
  
  /** 
   * setup game and table for headless GgReferee in a Player's browser. 
   * @param onJoin inform caller that GgReferee is ready.
   * @returns the GgReferee (like a constructor...)
   */
  makeRefJoinGroup(url: string, group: string, onJoin: (ack: CgMessage) => void): HgReferee {
    let refgs = new GameSetup(null) // refgs.table has no Canvas
    refgs.startup(refgs)            // get all the Cards/Decks from this.table [no ParamGUI]
    let ref = refgs.gamePlay.hgClient = newHgReferee(undefined) // No URL, no connectStack()
    let onOpen = (hgReferee: HgReferee) => {
      hgReferee.wsbase.log = 0
      hgReferee.cgBase.log = 0
      console.log(stime(hgReferee, `.onOpen: now join_game_as_player(0)`))
    }
    return ref.joinGroup(url, group, onOpen, onJoin);
  }

  
  async waitPaused(p = this.curPlayer, ident = '') {
    this.table.nextHex.markCapture()
    this.hexMap.update()
    let isPaused = !(p.planner as Planner).pauseP.resolved
    if (isPaused) {
      console.log(stime(this, `.waitPaused: ${p.colorn} ${ident} waiting...`))
      await p.planner.waitPaused(ident)
      console.log(stime(this, `.waitPaused: ${p.colorn} ${ident} running`))
    }
    this.table.nextHex.unmarkCapture()
    this.hexMap.update()
  }
  pauseGame(p = this.curPlayer) {
    p.planner?.pause();
    this.table.nextHex.markCapture(); 
    this.hexMap.update(); 
    console.log(stime(this, `.pauseGame: ${p.colorn}`)) 
  }
  resumeGame(p = this.curPlayer) {
    p.planner?.resume();
    this.table.nextHex.unmarkCapture(); 
    this.hexMap.update(); 
    console.log(stime(this, `.resumeGame: ${p.colorn}`))
  }
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
    if (this.curPlayer.plannerRunning) return
    this.undoMove()
    this.makeMove(true, undefined, 1)
  }

  /** 
   * after setNextPlayer: enable Player (GUI or Planner) to respond 
   * with table.moveStoneToHex()
   * 
   * Note: 1st move: player = otherPlayer(curPlayer)
   * @param auto this.runRedo || undefined -> player.useRobo
   */ 
  makeMove(auto = undefined, ev?: any, incb = 0) {
    let sc = this.table.nextHex.stone?.color
    if (!sc) debugger;
    let player = (this.turnNumber > 1) ? this.curPlayer : this.otherPlayer(this.curPlayer)
    if (this.runRedo) {
      this.waitPaused(player, `.makeMove(runRedo)`).then(() => setTimeout(() => this.redoMove(), 10))
      return
    }
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
  /** when true, run all the redoMoves. */
  set runRedo(val: boolean) { (this._runRedo = val) && this.makeMove() }
  get runRedo() { return this.redoMoves.length > 0 ? this._runRedo : (this._runRedo = false) }
  _runRedo = false
  
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
    super.addStone(hex, stoneColor)
    if (!!hex.stoneColor) hex.setStoneId(this.history.length)
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
  setNextPlayer0(plyr = this.otherPlayer()): Player {
    this.turnNumber = this.history.length + 1
    return this.curPlayer = plyr
  }
  setNextPlayer(plyr = this.otherPlayer()) {
    this.curPlayer = plyr
    this.turnNumber = this.history.length + 1
    this.table.showNextPlayer() // get to nextPlayer, waitPaused when Player tries to make a move.?
    this.makeMove()
  }

  /** dropFunc indicating new Move attempt */
  addStoneEvent(hev: HexEvent): void {
    let redo = this.redoMoves.shift()   // pop one Move, maybe pop them all:
    if (!!redo && redo.hex !== hev.hex) this.redoMoves.splice(0, this.redoMoves.length)
    this.doPlayerMove(hev.hex, hev.stoneColor)
    this.setNextPlayer()
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
    TP.maxBreadth = maxBreadth
    TP.maxPlys = maxPlys
    TP.nPerDist = nPerDist
    TP.pBoards = pBoards
    let gamePlay = GameSetup.setup.restart(mh, nh)  // NEW GamePlay: new LogWriter()
    gamePlay.setRedoMovesFromLog(lineAry)
    //gamePlay.runGameFromLog(redoAry, 0, delay)
  }
  setRedoMovesFromLog(lineAry: string[]) {
    let rv: IMove[] = this.redoMoves
    lineAry.forEach((line, ndx) => {
      if (line.length > 3) {
        let str = line.split('#')[0]
        let { undo, r, c, p } = JSON.parse(str) as { undo?: number, r?: number, c?: number, p: StoneColor }
        if (undo != undefined) {
          rv.pop()
        } else {
          let ihex = { row: r, col: c, Aname: Hex.aname(r, c) } as IHex
          let hex = Hex.ofMap(ihex, this.hexMap)
          let imove = new Move(hex, p, [])
          rv.push(imove)
        }
      }
    }, this)
    this.table.showRedoUndoCount()
    this.hexMap.update()
    return rv
  }

  async runGameFromLog(histAry: IMove[], toTurn = 0, delay = 0) {
    this.readerBreak = false
    let histMismatch = (nth = this.history.length - 1) => { 
      return this.history.find((move, ndx) => move.hex !== histAry[nth - ndx][0])
    }
    let turn = 0
    for ( ; turn < histAry.length-1; turn++) {
      let imove = histAry[turn], {stoneColor: sc, hex} = imove
      console.log(AT.ansiText(['red'], `move #${turn} =`), sc, imove.hex)
      if (turn >= toTurn) this.pauseGame() // start paused!
      //if (delay > 0) await new Promise((ok) => setTimeout(ok, delay));
      let nth = this.history.length
      this.showRedoMark(hex); this.hexMap.update()
      await this.waitPaused(undefined, `GamePlay.runGameFromLog(${[nth, hex, sc]})`)
      if (this.readerBreak) return // 'q' quits the replay
      let histm: Move
      if (histm = histMismatch()) {
        console.log(stime(this, `.runGameFromLog: histMismatch`), histm)
        return // TODO: replay up to mismatch!
      }
      this.table.doTableMove(hex, sc)
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
