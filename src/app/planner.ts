import { M, stime, AT } from "@thegraid/common-lib";
import { Move, IMove } from "./move";
import { GamePlay0, GamePlayD,  } from "./game-play"
import { Hex, HSC, IHex } from "./hex";
import { H, HexDir } from "./hex-intfs";
import { runEventLoop } from "./event-loop"
import { IPlanner } from "./plan-proxy";
import { WINARY } from "./stats";
import { otherColor, StoneColor, stoneColor0, stoneColor1, StoneColorRecord, stoneColorRecord, stoneColors, TP } from "./table-params";

function stoneColorValue (value: number) { return stoneColorRecord(value, -value)}
const WINVAL = stoneColorValue(Number.POSITIVE_INFINITY)
const RESVAL = stoneColorValue(Number.POSITIVE_INFINITY)
const STALEV = stoneColorValue(Number.POSITIVE_INFINITY)
let WINLIM = WINVAL[stoneColor0] // stop searching if Move achieves WINLIM[sc0]
let WINMIN = STALEV[stoneColor0] // stop searching if Move achieves WINLIM[sc0]

type Dir1 = 'NW' | 'SE' // Axis for firstMove
type Dir2 = Exclude<HexDir, Dir1> // intersecting axes for isSX
type HexState = [Hex, State]
class MOVES extends Map<Hex,State>{}
class PlanMove extends Move {
  state: State
  override ind(none = ' ') { 
    let caps = this.captured
    return super.ind(none, this.state.fj ? (!!caps ? '-' : '!') : undefined )
  }
}
interface GamePlayDH extends GamePlayD {
  history: PlanMove[];
  newMove(hex: Hex, sc: StoneColor, caps: Hex[], gp: GamePlay0): PlanMove
  sxInfo: SxInfo
}
/** 
 * After opponent's Move, where should curPlayer play? 
 * There are many available MOVES (we consider the top-ranked)
 * 
 * move is how we got here.. (move0)
 * color is pstat0 when computing value (s0 - s1)
 * value is value is the immediate static evaluation (before/without lookahead)
 * bestValue is Max value over the evaluated MOVES (maxPlys, maxBreadth)
 * bestHex being the Move that provides bestValue.
 * 
 * play (each of maxBreadth) hexes, [lookahead], eval at leaf state, 
 * propagate back [with min/max & pruning], keep bestState, bestHex
 */
class State {
  static sid = 0
  //move: Move; 
  //color: StoneColor; 
  /** evaluated to depth (= tn+ ~nPlys) */
  eval: number = 0
  val: number[]  // unshift for each lookahead...
  readonly v0: number; 
  readonly winAry: WINARY
  bestValue: StoneColorRecord<number>; 
  bestHexState: HexState // [bestHex -> bestState -> bestValue]
  id: number; 
  turn: number; // turn/protoTurn when this move was analyzed
  moveAry: HexState[]
  _nMove: number
  get nMoves() { 
    let num = this.moveAry?.length || 0
    return `${num}/${this._nMove || num}`
  }
  fjx: boolean 
  get fj () {return (this.move.captured.length == 0 && this.move.hex.isThreat(otherColor(this.color)))}
  get bv() { return this.bestValue[this.color]}
  get bvs() { 
    let bv = this.bv
    return (Number.isFinite(bv)) ? (bv == 0 ? '0.0' : bv.toString()) : bv < 0 ? ` -${H.infin}` : ` +${H.infin}`
  }
  ind(none = ' ') { 
    return this.move.ind(none)
  }
  get mAry() { return this.moves(this.turn) }
  setBestValue(value: number) {
    if (Number.isNaN(value)) debugger;
    value = M.decimalRound(value, 4)
    if (Number.isNaN(value)) debugger;
    this.bestValue = stoneColorValue(value)
  }
  /**
   * @param move for doc/debug: last move to get to this state
   * @param color last player to placeStone; == move.color == history[0].color
   * @param v0 value to stoneColor0 [lh == 0]
   * @param winAry gStats; for winAny = gameOver(...winAry) // winAry[0] == this.board
   */
  constructor(public move: PlanMove, public color: StoneColor, v0: number, winAry: WINARY, copyof?: State) {
    if (copyof) {
      for (let [key, val] of Object.entries(copyof)) this[key] = val
      this['copyof'] = copyof // same as this.move.state: the orig mutating State
      if (move !== undefined) {
        // when move is supplied, restore it. Also: inner fields are shared with 'copyof'
        this.move = move  // suitable when state is retrieved from boardState
      } else {
        // a copyOf() non-mutation clone: make copies of inner Array/tuple/Record:
        this.copyStructs(this)
      }
    } else {
      this.v0 = v0 = M.decimalRound(v0, 4)
      this.setBestValue(v0)
      this.id = ++State.sid
      this.winAry = winAry
    }
  }
  copyStructs(otherState: State) {
    // ASSERT: winAry is invariant, contents will not change
    this.moveAry = otherState.moveAry?.concat()
    this.setBestValue(otherState.bestValue[stoneColor0])
    otherState.bestHexState && this.setBestHexState(otherState.bestHexState, 1)
  }
  /** cloning constructor: a non-mutating copy of this State; suitable for console.log 
   * this.move could still mutate, as does this.move.state
   */
  copyOf(): State {
    return new State(undefined, this.color, this.v0, this.winAry, this)
  }
  upState(move: PlanMove, color: StoneColor, value: number) {
    this.move = move
    this.color = color
    this.setBestValue(value)
  }
  sortMoves(sc: StoneColor = otherColor(this.color)) {
    this.moveAry.sort(([ha, sa], [hb, sb]) => sb.bestValue[sc] - sa.bestValue[sc]) // descending
  }
  nextState(hex: Hex) {
    let hexState = this.moveAry?.find(([h, s]) => h == hex)
    return hexState && hexState[1]
  }

  /** this.setBestValue(bestHexState.bestValue[sc0]) */
  setBestHexState(bestHexState: HexState, w = TP.pWeight) {
    let [bhex, state2] = bestHexState
    let v0 = this.bestValue[stoneColor0], v2 = state2.bestValue[stoneColor0], value = v2
    if ((Math.abs(v2) < WINMIN && Math.abs(v0) < WINMIN)) // for non-winning values:
      value = (v2 * w + v0 * (1 - w))
    this.setBestValue(value)
    this.eval = state2.eval
    this.bestHexState = bestHexState
  }

  moves(tn: number) {
    let bh = this.bestHexState?.[0]
    let pad = (s: number, n = 3, d = 0) => { return `${s.toFixed(d).padStart(n)}` } // ${s >= 0 ? ' ' : ''}
    return this.moveAry?.map(([h, s]) => [s.move,
    `${s.move.Aname}${s.ind(s.eval > tn ? '+' : '.')} v0: ${pad(s.v0, 4, 1)}, [${pad(s.eval,2)}] ${(h == bh) ? '*' : ' '}bv: ${s.bvs}, id=${pad(s.id)}`,
    s.move.board.toString(), s.copyOf()])
  }
  moves0(tn: number) {
    let bh = this.bestHexState?.[0]
    return this.moveAry?.map(([h, s]) => [s.move, s.eval, (h == bh) ? '*' : ' ',
    s.move.Aname, s.ind(s.eval > tn ? '+' : '.'),
    s.v0, s.bvs, s.id,
    s.move.board.toString(), s.bestHexState[1].copyOf()])
  }
  logMoveAry(ident: string, tn: number) {
    let color = TP.colorScheme[otherColor(this.color)]
    let colorn = AT.ansiText(['italic', 'red'], `${color}#${tn}`)
    let moves = this.moves(tn)
    TP.log > -1 && console.log(stime(this, `${ident}(bv=${this.bvs}) moveAry(${colorn})[${this.nMoves}] =`), moves)
  }}

/** TODO: get es2015 Iterable of Map.entries work... */
function entriesArray(k: MOVES) {
  let rv: HexState[] = []
  for (let m of k) { rv.push(m) }
  return rv
}
/**
  dStones: number[] = Array(7);       // per-district
  dMinControl: boolean[] = Array(7);  // per-district true if minControl of district
  dMax: number                        // max dStones in non-central district
  nStones: number = 0;   // total on board
  nInf: number = 0;      // (= nStones*6 - edge effects - E/W-underlap)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone)
  nAttacks: number = 0;  // (Hex w/ inf >= 2)
  nAdj: number = 0;      // where 2 Hexes of same color are adjacent (times 2, a:b + b:a)
  inControl(d: StoneColor)  { return this.gStats.inControl[this.plyr.color][d]; }
 */

/**
 * Planner: eval-node: makeState, find children, for [each] child: eval-node
 */

// remove Move from State; state.color should suffice (whose turn is it?)
// presumably can check history[0] to find "the move that got us here"
// but this way when a State is achieved by different means, we can use it.
// Note... board identity requires that [caps] are also the same; but not last-move
export class Planner implements IPlanner {
  roboRun = true  // set to FALSE to break the search.
  /** enable Planner to continue searching */
  roboMove(run = true) { this.roboRun = run }
  terminate() {} // TODO: maybe run GC or summary stats?

  gamePlay: GamePlayDH
  myWeightVec: number[]
  prevMove: Move // previous Move
  get depth() { return this.gamePlay.history.length + 1 } // accounting for Stones we have played
  /** copy of gamePlay.turnNumber: gamePlay.history.length + 1 */
  moveNumber: number
  boardState: Map<string,State> = new Map<string,State>()
  get brds() { return this.gamePlay.allBoards.size;}
  sxInfo: SxInfo
  
  get skipHex() { return this.gamePlay.hexMap.skipHex }
  get resignHex() { return this.gamePlay.hexMap.resignHex }
  /** make skipState or resignState for given color (and unshift to gamePlay.history) */
  skipMove(color: StoneColor) { return new PlanMove(this.skipHex, color, [], this.gamePlay) as PlanMove }
  resignMove(color: StoneColor) { return new PlanMove(this.resignHex, color, [], this.gamePlay) as PlanMove }

  constructor(mh: number, nh: number, playerIndex: number) {
    let color = stoneColors[playerIndex], colorn = TP.colorScheme[color]
    this.myPlayerNdx = playerIndex
    this.myStoneColor = color
    this.gamePlay = new GamePlayD(mh, nh, colorn) as GamePlayDH // downgraded to GamePlayD: history, hexMap, undoRecs, allBoards, gStats
    this.gamePlay.newMoveFunc = (hex, sc, caps, gp) => new PlanMove(hex, sc, caps, gp)
    this.myWeightVec = this.getWeightVec(color)
  }
  getWeightVec(color: StoneColor) {
    // compatible with statVector in stats.ts
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    let dStoneM0 = new Array<number>(nDist).fill(1, 0, nDist); dStoneM0[0] = 1
    // score0 = inControl, dMax, nStones, nInf, nAttacks, nAdj
    let scoreM0 = 1.3, dMaxM0 = 1, nStonesM0 = 1.1, nInfM0 = .3, nThreatsM0 = .25, nAttacksM0 = .5, nAdjM0 = .1
    let wv0 = dStoneM0.concat([scoreM0, dMaxM0, nStonesM0, nInfM0, nThreatsM0, nAttacksM0, nAdjM0])

    let dStoneM1 = new Array<number>(nDist).fill(1, 0, nDist); dStoneM1[0] = .8
    let scoreM1 = 1.4, dMaxM1 = .9, nStonesM1 = 1.0, nInfM1 = .25, nThreatsM1 = .30, nAttacksM1 = .6, nAdjM1 = .2
    let wv1 = dStoneM1.concat([scoreM1, dMaxM1, nStonesM1, nInfM1, nThreatsM1, nAttacksM1, nAdjM1])
    return stoneColorRecord(wv0, wv1)[color]
  }
  /** time at last yield (or initial makeMove) */
  ms0: number
  ms00: number
  yieldMs: number      // compute for this long before doing a voluntary yield
  maxDepth: number
  myPlayerNdx: number // my Player.index
  myStoneColor: StoneColor // from myPlayerIndex
  readonly scMul = stoneColorRecord(1, -1)
  readonly dir1: Dir1 = 'NW'
  maxBreadth = TP.maxBreadth

  /** play this Stone, Player is stone.color */
  makeMove(color: StoneColor, iHistory: IMove[], incb = 0): Promise<IHex> {
    this.ms0 = this.ms00 = Date.now()
    this.maxBreadth = TP.maxBreadth + incb     // on request: look at more [or fewer] Moves
    this.maxDepth = Number.NEGATIVE_INFINITY
    //debugger;
    this.syncToGame(iHistory)   // setHexMap, allBoards, turnNumber
    // NOW: we are sync'd with mainGame...
    let sid0 = State.sid, ms0 = Date.now() - 1

    let fillMove: (hex: Hex | PromiseLike<Hex>) => void, failMove: (reason?: any) => void 
    let movePromise = new Promise<Hex>((fil, rej) => {
      fillMove = fil; failMove = rej
    })
    let maybeResign = (hexState: HexState) => {
      let [hex, state] = hexState
      if (state.bv <= -WINMIN)
        if (state.eval <= this.moveNumber + TP.pResign) {
          hex = this.resignHex
          let move = this.gamePlay.newMove(hex, state.color, [], this.gamePlay)
          this.gamePlay.incrBoard(move)
          let resign = this.evalState(move)
          resign.bestHexState = hexState    // for the record: what we would have done if not resign
          return [hex, resign] as HexState
        }
      return hexState
    }

    let firstMove = () => {
      State.sid = sid0 = 0
      let mhex = this.gamePlay.hexMap.district[0][0], dir = this.dir1
      while (mhex.metaLinks[dir]) mhex = mhex.metaLinks[dir]
      // Note: we don't doLocalMove; will pick it up on next syncToGame(history)
      // OR: doLocalMove(); new HexGen().setSxInfo()
      fillMove(mhex)
    }
    let state0: State
    let dispatchMove = (hexState: HexState) => {
      let [hex, state] = maybeResign(hexState)
      this.doLocalMove(hex, color)  // placeStone on our hexMap & history
      this.reduceBoards(true)       // reduce & prune
      this.boardState.clear()       // TODO: keep the subset derive from current/actual Moves/board
      let tn = this.moveNumber
      let dsid = State.sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      let tns = tn.toString().padStart(3), dsids = dsid.toLocaleString().padStart(10), dmss = dms.toString().padStart(7)
      let hexstr = hex.toString(color) // like move.Aname but shows @Resign
      let mc = state.ind()
      this.logEvalMove(`.dispatchMove`, state0, TP.maxPlys, undefined, state)
      console.log(stime(this, `.makeMove: ${AT.ansiText(['bold', 'green'],
        `// #${tns} ${hexstr}${mc} dms:${dmss} dsid:${dsids} n:${state0.nMoves}`)}`),
        { dsid: dsid.toLocaleString(), dms, sps, maxD: this.maxDepth, state: (TP.log > -1) && state.copyOf() });
      this.prevMove = this.gamePlay.history[0]
      fillMove(hex)
    }
    //let [win, winAry] = gamePlay.gStats.updateStats() // unused? set baseline for lookahead ??
    if (this.moveNumber == 1) {
      firstMove()
    } else {
      // syncToGame has unshifted other Player's move into history[0] (and maybe changed history[1]... )
      // try get previously evaluated State & MOVES:
      let history = this.gamePlay.history 
      let move1 = history[1], move0 = history[0], hex0 = move0.hex
      state0 = move0.state // with doHistoryMove().eval
      if (move1?.board?.id && move1.board.id == this.prevMove?.board?.id) { //
        // history[1] has NOT been changed! so we can use our analysis:
        state0 = move1.state.nextState(hex0) // opponent moved to a predicted & eval'd State (with a moveAry!)
        TP.log > -1 && console.log(stime(this, `.makeMove: prevMove = move1.state0:`), state0)
      }
      if (!this.sxInfo) this.sxInfo = new SxInfo(this.gamePlay)
      let nPlys = TP.maxPlys, breadth = this.maxBreadth
      this.yieldMs = Math.max(TP.yieldMM, Math.max(20, 5 * (nPlys + breadth - 7))) // pWorker -> yieldMM

      if (!state0) state0 = this.evalState(move0, state0) // move0->state0 (placed by syncGame)
      this.lookaheadInDepth(state0, color, nPlys, breadth, true).then((hexState: HexState) => dispatchMove(hexState))
    }
    return movePromise
  }

  /** do move from main.history: translate hex */
  doHistoryMove(moveg: IMove) {
    let move1 = this.gamePlay.history[0]
    let hex0 = Hex.ofMap(moveg.hex, this.gamePlay.hexMap)
    let move0 = this.doLocalMove(hex0, moveg.stoneColor) // do actual move to hex0, setting move0.state
    if (move1) {
      // instead of searching boardState, look for existing State in move1.state:
      let state1 = move1.state                        // as we were before moveg
      let state0a = state1.nextState(hex0)            // state0a may be undefined (if hex0 was not predicted & eval'd)
      let state0 = this.evalState(move0, state0a)     // make or update state0, move0.state = state0a
      // historical record: state2(move1.hex1)->state1; state1(move0.hex0)->state0
      if (!state0a) { // hex0 was not previously predicted/evaluated
        if (!state1.moveAry) state1.moveAry = []
        state1.moveAry.push([hex0, state0])  // As if we had predicted this, but not deeply evaluated...
      }
    } // if move0.color == myStoneColor: set this.prevMove? [not that it has any useful moveAry...]
    return 
  }
  /** 
   * placeStone(); closeUndo()
   * @param hex on OUR map
   */
  doLocalMove(hex: Hex, color: StoneColor) {
    let move = this.placeStone(hex, color) // NEW Move in history[0] (generally for otherPlayer's latest Move)
    this.evalState(move) // setting move.state
    this.gamePlay.undoRecs.closeUndo()
    return move
  }
  /** make Move, unshift, addStone -> captured  
   * @param pushUndo if defined: push the current undoRecs, open a new undoRecs.
   */
  placeStone(hex: Hex, color: StoneColor, pushUndo?: string) {
    let gamePlay = this.gamePlay // unshift(Move), addStone, incrBoard
    let move0 = new PlanMove(hex, color, [], gamePlay) // new Move() -> gamePlay.history.unshift(move)
    if (pushUndo) this.gamePlay.undoRecs.saveUndo(pushUndo).enableUndo() // placeStone
    gamePlay.addStone(hex, color)        // may invoke captureStone() -> undoRec(Stone & capMark)
    gamePlay.incrBoard(move0)
    return move0
  }
  /** 
   * @param move if supplies delete move.board.id from allBoards
   * @param popUndo if true: pop all the current undoRecs; pop back to previous undoRecs
   */
  unplaceStone(move?: Move, popUndo = false) {
    let gamePlay = this.gamePlay          // undoRecs, shiftMove
    if (popUndo) gamePlay.undoRecs.closeUndo().restoreUndo() // like undoStones(); SHOULD replace captured Stones/Colors
    else {gamePlay.undoRecs.closeUndo(); gamePlay.undoStones() }
    gamePlay.shiftMove()
  }
  syncToGame(main: IMove[]) {
    let ours = this.gamePlay.history
    // our extra moves cannot be useful [there has been some Undo on the mainGame]
    while (ours.length > main.length) this.unplaceStone(ours[0])
    let m = 0    // number of Moves to retain on ours.history:
    for (; main.length-m-1 >= 0 && ours.length-m-1 >= 0; m++) {
      if (main[main.length-m-1].Aname != ours[ours.length-m-1].Aname) break // skip oldest moves common to both
    }
    while (ours.length > m) this.unplaceStone(ours[0]) // undo our moves that are different
    // apply otherPlayer and/or manual Moves; appy mainGame Moves in proper order:
    while (main.length > ours.length) {
      this.doHistoryMove(main[main.length - ours.length - 1])
    }
    this.moveNumber = ours.length + 1 // iHistory.length + 1
    this.reduceBoards()  // update repCount and delete un-attained Boards
  }
  reduceBoards(prune = true) {
    // TODO: replace boardState with stepping down state0.moveAry(move0.hex)->state1.moveAry(move1.hex)->...
    // reset all repCounts; [MAYBE remove Boards that are no longer 'accessible']
    let history = this.gamePlay.history, ab = this.gamePlay.allBoards, bs = this.boardState
    for (let [id, board] of ab.entries()) {
      // board.setRepCount(history)
      // space-time tradeoff: keep evaluated Board/Ids/States in memory?
      if (board.setRepCount(history) == 0 && prune) {
        bs.delete(id)
        ab.delete(id)
      }
    }
  }
  /** 
   * Compute v0 & fj for State representing the current board.
   * After every planner.placeStone() -> move; evalMove(move, state1?)
   * @param move  for documentation/debugging: move that brought us to this state
   * @param state1 [new State(value)] OR [fill state1 with move, color] then set bestValue, fj, eval, winState
   */
  evalState(move: PlanMove, state1?: State): State {
    // move => state1 (because: state0.nextHexState(hex) => [hex, state1]
    // so we don't _need_ boardState.get(move.board.id) => state1
    // boardState would be useful for 'convergent' paths to same Board/State
    if (state1) { move.state = state1; return state1; }
    let color = move.stoneColor
    let board = move.board, boardId = board.id
    //let [boardId, resign] = this.gamePlay.boardId 
    let state = this.boardState.get(boardId) // reuse State & bestValue
    if (state) {
      if (!state1) 
        state1 = new State(move, color, state.v0, state.winAry, state) // clone it
      else if (state.eval > state1.eval) {
        state1.copyStructs(state)
        state1.eval = state.eval    // #of Moves to achieve this board (this.depth-1)
      }
    } else {
      if (!state1) {
        let gStats = this.gamePlay.gStats
        let [win, winAry] = gStats.updateStats(board)  // calc stats & score for VP win
        let s0 = gStats.getSummaryStat(stoneColor0, this.myWeightVec)
        let s1 = gStats.getSummaryStat(stoneColor1, this.myWeightVec)
        let v0 = s0 - s1 // best move for c0 will maximize value
        state1 = new State(move, color, v0, winAry) // state.move = move; state.moveAry = undefined
        state1.turn = state1.eval = this.gamePlay.history.length  // #of Moves to achieve this board (this.depth-1)
        //if (win !== undefined) console.log(stime(this, `.evalState: win!${win} ${state1.id} state1=`), state1)
      }
    }
    //state1.fj = (move.captured.length == 0 && move.hex.isThreat(otherColor(color)))
    this.maxDepth = Math.max(this.maxDepth, state1.eval)   // note how deep we have gone... (for logging)
    this.winState(state1)      // adjust value if win/lose (resign, stalemate)
    if (TP.pBoards && !state) this.boardState.set(boardId, state1) // avoid eval(new State)
    move.state = state1        // move->state [&&] state.move = move
    return state1
  }
  /** set state.setBestValue(+/- WINVAL|RESVAL|STALEV) [if I win/lose] */
  winState(state: State): StoneColor {
    let win = this.gamePlay.gStats.gameOver(...state.winAry)
    if (win !== undefined) {
      let winVP = state.winAry[1], resigned = state.winAry[0].resigned
      let value = (winVP ? WINVAL : resigned ? RESVAL : STALEV)[win]
      state.setBestValue(value)
      //console.log(stime(this, `.winState: win!${win} ${state.id} state1=`), state)
    }
    return win
  }


  /** used in groupCollapsed(lookahead) */
  logId(state0: State, nPlys: number) {
    let tn = this.depth, sc = otherColor(state0.color), mn = this.moveNumber
    let mov0 = this.gamePlay.history[0]
    let gid0 = `${tn}/${mn+TP.maxPlys} after        ${mov0.Aname}#${tn-1}(${state0.bv})`
    let gid1 = `${mov0.board?.id}#${mov0.board.repCount} ${TP.colorScheme[sc]}#${tn}`
    return `${gid0}: ${gid1}->`
  }
  logEvalMove(ident: string, moveOrState: PlanMove | State, nPlys: number, win: StoneColor, state2?: State) {
    if (TP.log > 0 || nPlys == undefined) {
      let state1 = (moveOrState instanceof State) ? moveOrState : moveOrState.state
      let winInd = (win !== undefined) ? ` --> win: ${TP.colorScheme[win]}` : ''
      let vals = (state2) ? {
        mov1: `${state1.move.Aname}${state1.ind()}`, eval: state1.eval, bv: state1.bv, state1: state1.copyOf(),
        mov2: `${state2.move.Aname}${state2.ind()}`, state2: state2.copyOf()
      }
        : { move: `${state1.move.Aname}${state1.ind()}`, eval: state1.eval, bv: state1.bv, state1: state1.copyOf() }
      console.log(stime(this, `${ident}: nPlys: ${nPlys || TP.maxPlys}${winInd}`), vals)
    }
  }
  logAndGC(ident: string, state0: State, sid0: number, ms0: number, nPlys: number, stoneColor: string) {
    let [bestHex, bestState] = state0.bestHexState
    if (TP.log > 0 || this.depth == this.moveNumber) {
      let dsidn = State.sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsidn / dms, 0)
      let dsid = dsidn.toLocaleString()
      state0.logMoveAry(ident, this.depth)
      let bestValue = bestState.bv, move = bestState.move
      let Aname = bestHex.toString(move.stoneColor), nBoards = this.gamePlay.allBoards.size
      //console.log(stime(this, `${ident}X:`), nPlys, stoneColor, { Aname, bestValue, sps, dsid, dms, bestState: bestState.copyOf(), sid: State.sid, nBoards })
    }
    if (TP.log == 0 && this.depth == this.moveNumber) { // delete a bunch of States:
      // moveAry[I..J].moves: [hexI, state1-I] ... [hexJ, state1-J]
      // state1-I.moves: [hexK, state2-K] ... [hexL, state2-L] --> sstate1-I.moves = undefined
      if (TP.pGCM) {            // TODO: run GC on our *previous*, not current move (so we can 'redo' current move)
        let bestStateMoveAry = bestState.moveAry
        for (let [hex, state1] of state0.moveAry) {
          state1._nMove ||= state1.moveAry?.length // before TP.pGCM delete
          state1.moveAry = undefined // since we are not moving to 'hex', remove the stored analysis tree
          state1['agc'] = this.depth
        }
        bestState.moveAry = bestStateMoveAry // retain HexState tree of bestHex/bestState
        bestState._nMove ||= bestState.moveAry.length // reset after TP.pGCM delete
      }
    }
    // other 'GC' part: (release refs to minimally evaluated HexStates)
    state0._nMove ||= state0.moveAry?.length  // before filter
    state0.moveAry = state0.moveAry.filter(([h,s]) => s.eval > this.depth) // release un-evaluated HexStates
  }
  /** show progress in log, how much of breadth is done */
  nth = 0;

  moveAryBreak(state1a: State, bestState: State, breadth: number): boolean {
    return (!this.roboRun || breadth < 0 ) || bestState.bestValue[state1a.color] >= WINLIM
  }
  moveAryContinue(state1a: State, bestState: State): boolean {
    let s1v = state1a.bestValue[state1a.color] + .01
    return s1v < Math.min(bestState.bestValue[state1a.color], bestState.v0)
  }

  /** allow limited dogfight analysis */
  fjCheckP(state1: State) { return state1.fj && (this.depth < this.moveNumber + TP.maxPlys + 1)}
  /** fjCheck: even nPlys > 2, then even turnNumber - which seems biased against 'w'; (bv2+bv3)/2 is sufficient? */
  nPlysCheckE(nPlys: number, fjCheck: boolean, ) { 
    return !fjCheck ? nPlys : Math.max(nPlys + (nPlys % 2), 2)// + 1 - this.myPlayerNdx 
  }

  /** return the better HexState (from POV of sc) */
  maxBestValue(bHS1: HexState, bHS2: HexState, sc: StoneColor) {
    return (bHS1[1].bestValue[sc] > bHS2[1].bestValue[sc]) ? bHS1 : bHS2 // MAX
  }


  /** 
   * lookahead from current State; with its potential MOVES. 
   * select hex->state1a with MAX(state1a.bestValue)
   * 
   * try someMoves, update State values looking maxPlys deep;
   * 
   * otherColor [state0.color] has just moved.
   * 
   * other player has left board in state0 (which we may have foreseen & evaluated)
   * @param state0 current State/value of Board (played by otherPlayer)
   * @param stoneColor from State0, place a Stone of this color (curPlayer)
   * @param nPlys how deep to go; 0 for immediate eval, 2 for fjCheck, OR count down from TP.maxPlys
   * @param breadth typically = TP.maxBreadth; for free-jeopardy it may be lower = Min(TP.maxBreadth, 6)
   * @return [bestHex, bestState]: state1a [from moveAry] {move: new Move(hex->bestState), bestValue: max(...hex)}
   */
  async lookaheadInDepth(state0: State, stoneColor: StoneColor, nPlys?: number, breadth = TP.maxBreadth, isTop = false): Promise<HexState> {
      if (isTop) this.nth = breadth
    let group = false
    try {
      TP.log > 0 && (console.groupCollapsed(`${stime(this, `.lookaheadInDepth: `)}${this.logId(state0, nPlys)}`), group = true)
      let sid0 = State.sid, ms0 = Date.now(), brd0 = this.brds // current state id

      let bestHexState = state0.bestHexState
      if (TP.pMoves && bestHexState && bestHexState[1].eval >= this.depth) {
        if (nPlys > 0) {
          // maybe it will go deeper and find better hex/state:
          let [hex, bestState] = bestHexState; {
            let bestHexState1 = this.evalMoveShallow(hex, stoneColor, nPlys - 1, bestState)
            bestHexState = this.maxBestValue(bestHexState1, bestHexState, stoneColor)
          }
          state0.setBestHexState(bestHexState)
        }
      } else {
        this.evalAndSortMoves(state0, stoneColor)
        bestHexState = state0.bestHexState // == state0.moveAry[0]
        if (nPlys > 0) {
          for (let [hex, state1a] of state0.moveAry) {                 // hex = state1a.move.hex
            if (this.moveAryContinue(state1a, bestHexState[1])) continue; // break; //
            if (isTop) this.nth = breadth - 1
            if (this.moveAryBreak(state1a, bestHexState[1], --breadth)) break
            let bestHexState1 = (nPlys > 1)
              ? await this.evalMoveInDepth(hex, stoneColor, nPlys - 1, state1a)
              : /* */ this.evalMoveShallow(hex, stoneColor, nPlys - 1, state1a)
            bestHexState = this.maxBestValue(bestHexState1, bestHexState, stoneColor)
          }
          state0.setBestHexState(bestHexState) // best of what we just looked at. TODO: compare to other evaluated states
        }
      }
      this.logAndGC(`.lookaheadInDepth:`, state0, sid0, ms0, nPlys, stoneColor)

      // timers and voluntary yield:
      let dsid = State.sid - sid0, now = Date.now(), dmc = now - this.ms0, dtn = this.depth - this.moveNumber
      let dms = now - ms0, dmy = -1, sps = M.decimalRound(1000 * dsid / dms, 0), dbd = this.brds - brd0 
      if (TP.yield && dmc > this.yieldMs) {  // compute at least 10 -- 100 ms
        await runEventLoop()                 // voluntary yield to allow event loop (& graphics paint)
        this.ms0 = Date.now()
        dmy = this.ms0 - now
      }
      if (TP.log > 0 || dmy > -1) console.log(stime(this, `.lookaheadInDepth timers:`),
        `b=${this.nth} dtn=${dtn} dmc=${dmc} dmy=${dmy} dbd=${dbd} dsid=${dsid} dms=${dms} sps=${sps} sid=${State.sid.toLocaleString()} tsec=${(now - this.ms00) / 1000}`)

      // returning a State tells allowEventLoop to terminate with: dispatchMove(bestState)
      group && console.groupEnd()
      return bestHexState
    } catch (err) {
      group && console.groupEnd()
      throw err
    }
  }

  /** 
   * PlaceStone(hex, color) -> state1; lookahead recursively to find/estimate bestValue
   * @param hex play Stone to Hex and evaluate the State
   * @param stoneColor place stoneColor on hex; see how good that is.
   * @param nPlys evalState(move), then lookahead (nPlys, other) to obtain bestValue of move. [default: 0 --> no lookahead (unless fjCheck)]
   *              Note: callers use evalMoveShallow when nPlys = 0, 1
   *              if nPlys = 0; generate/evalState(stoneColor, Move(hex, stoneColor))
   * @param state1 Move(hex, color) -> state1; set state1.eval & state1.bestValue (nPlys)
   * @return hex, !!state1 ? (the better of bestState, state1) : newState(move(hex, stoneColor), stoneColor)
   */
  async evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number = 0, state1: State): Promise<HexState> {
    if (nPlys < 0) debugger; // expect nPlys > 0
    // move == state1.nextHexState(hex)[1].move
    let move = this.placeStone(hex, stoneColor, `eMID`)  // new Move(hex, color) -> addStone -> ... state1 [eval=0]
    let state = this.evalState(move, state1)
    let win = this.winState(state)
    this.logEvalMove(`.evalMoveInDepth`, move, nPlys, win)
    // state1: new Move(hex, color) evaluated @ depth
    if (win === undefined) {
      // move into jeopardy [without capturing] is generally bad: (but *maybe* the stone is untakable...)
      // get a better assessment (& likely lower the ranking of this move)
      let fjCheck = this.fjCheckP(state) // or just state1.fj??
      if (nPlys > 0 || fjCheck) {
        let nPlys2 = this.nPlysCheckE(nPlys, fjCheck)
        let [hexn, state3] = await this.lookaheadInDepth(state1, otherColor(stoneColor), nPlys2)
        let bv3 = state3.bestValue[stoneColor0], state2: State
        if (state3.fj && (state2 = this.stateBefore(state, state3)).fj) {
          let bv2 = state2.bestValue[stoneColor0]
          // Alternative value computation for continuing dogfight:
          if (bv3 < WINMIN) bv3 = (bv2 + bv3) / 2
        }
        state.setBestValue(bv3)
        state.eval = state3.eval        
        this.logEvalMove(`.evalMoveInDepth`, move, nPlys, win, state3)
      }
    }
    this.unplaceStone(move, true)
    return [hex, state1]
  }

  /** 
   * find [opponents] bestState/bestValue evaluating nPlys from state0
   * reduce state0.bestValue based on opponents best solution
   * @param state0 look a few moves ahead from here
   * @param stoneColor next player [opposite(state0.move.color)]
   * @param nPlys 0, 1, 2 (or more?)
   * @param breadth min(TP.maxBreadth, 6) // ASSERT: state.fj == true
   * @return bestState from moveAry (or skipHex)
   */
  lookaheadShallow(state0: State, stoneColor: StoneColor, nPlys = TP.maxPlys, breadth = TP.maxBreadth): HexState {
    let group = false
    try {
      TP.log > 0 && (console.groupCollapsed(`${stime(this, `.lookaheadShallow:${this.fjCheckP(state0)?'-':'+'}`)}${this.logId(state0, nPlys)}`), group = true)
      let sid0 = State.sid, ms0 = Date.now() // current state id
      let bestHexState = state0.bestHexState
      if (TP.pMoves && bestHexState && bestHexState[1].eval >= this.depth) {
        if (nPlys > 0) {
          // maybe it will go deeper and find better hex/state:
          let [hex, bestState] = bestHexState; {
            let bestHexState1 = this.evalMoveShallow(hex, stoneColor, nPlys - 1, bestState)
            bestHexState = this.maxBestValue(bestHexState1, bestHexState, stoneColor)
          }
          state0.setBestHexState(bestHexState)
        }
      } else {
        this.evalAndSortMoves(state0, stoneColor)
        bestHexState = state0.bestHexState // == state0.moveAry[0]
        if (nPlys > 0) {
          for (let [hex, state1a] of state0.moveAry) {                 // hex = state1a.move.hex
            if (this.moveAryContinue(state1a, bestHexState[1])) continue; // break; //
            if (this.moveAryBreak(state1a, bestHexState[1], --breadth)) break
            let bestHexState1 = this.evalMoveShallow(hex, stoneColor, nPlys - 1, state1a) // eval move and update state1a
            bestHexState = this.maxBestValue(bestHexState1, bestHexState, stoneColor)
          }
          state0.setBestHexState(bestHexState)
        }
      }
      this.logAndGC(`.lookaheadShallow`, state0, sid0, ms0, nPlys, stoneColor)
      group && console.groupEnd()
      return bestHexState
    } catch (err) {
      group && console.groupEnd()
      throw err
    }
  }

  /** set state.value/bestValue; lookahead only if state.fj & !win 
   * @param hex play Stone to hex
   * @param stoneColor Stone being played
   * @parma nPlys lookahead [0,1,2] (for fjCheck)
   * @param state1 the resultant state from move(hex,color) (from state0.moveAry[hex])
   * @return state1a (or create if not supplied)
   */
  evalMoveShallow(hex: Hex, stoneColor: StoneColor, nPlys: number, state1: State): HexState {
    let move = this.placeStone(hex, stoneColor, `eMS`)     // new Move(hex, color) -> addStone -> ... state1
    let state = this.evalState(move, state1)
    let win = this.winState(state)
    this.logEvalMove(`.evalMoveShallow`, move, nPlys, win)
    // maybe lookahead a few more plys:
    if (win === undefined) {
      let fjCheck = this.fjCheckP(state)
      if (nPlys > 0 || fjCheck) {
        let nPlys2 = this.nPlysCheckE(nPlys, fjCheck)
        let [hexn, state3] = this.lookaheadShallow(state, otherColor(stoneColor), nPlys2)
        let bv3 = state3.bestValue[stoneColor0], state2: State
        if (state3.fj && (state2 = this.stateBefore(state, state3)).fj) {
          let bv2 = state2.bestValue[stoneColor0]
          // Alternative value computation for continuing dogfight:
          if (bv3 < WINMIN) bv3 = (bv2 + bv3) / 2
        }
        state.setBestValue(bv3)
        state.eval = state3.eval
        this.logEvalMove(`.evalMoveShallow`, move, nPlys, win, state3)
      }
    }
    this.unplaceStone(move, true)
    return [hex, state]
  }

  /** find the State (& Move) that preceded stateN */
  stateBefore(state: State, stateN: State) {
    let state1: State 
    while ((state1 = state.bestHexState[1]) != stateN) state = state1
    return state
  }
  /** 
   * Initialize state0.moveAry with skipMove
   * 
   * find some Moves from HexGen: ifLegalMove then placeStone(hex); evalState(move)
   * find some Moves from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * 
   * @param sc from state0, place a Stone of this color; sort for that color
   * @return with state0.moves sorted, descending from best initial value
   */
  evalAndSortMoves(state0: State, sc: StoneColor): HexState[] { // Generator<void, State, unknown>
    const eASMS = AT.ansiText(['blue'],'.evalAndSortMoves')
    const tn = this.depth, tns = tn.toString().padStart(2), other = otherColor(sc) // <--- state0.stoneColor
    const ident = `${eASMS} depth = ${tn} after ${state0.move.Aname}#${tn-1}`
    const gamePlay = this.gamePlay
    let moveAry = state0.moveAry
    let useMoveAry = TP.pMoves && moveAry?.length > 1
    let ms0 = Date.now(), sid0 = state0.id, brd0 = this.brds, group = false

    const evalf = (move: PlanMove) => {
      // From isLegalMove: move = placeStone(hex, color) // ASSERT move.color == stoneColor
      let state1 = this.evalState(move) // inside eASMs.evalf()
      let win = gamePlay.gStats.winAny
      let fjCheck = this.fjCheckP(state1)
      if (fjCheck && win === undefined) this.lookaheadShallow(state1, other, 2) // adjust state1.bestValue
      moveAry.push([move.hex, state1])

      let dsid = State.sid - sid0, now = Date.now(), dmc = now - this.ms0, dbd = this.brds - brd0
      let dtn = this.depth - this.moveNumber, dms = now - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      if (dtn == 1 && (TP.log > 0 || dms > this.yieldMs)) {
        console.log(stime(this, `${eASMS} timers:`),
          `b=${this.nth} dtn=${dtn} dmc=${dmc} dmy=${0} dbd=${dbd} dsid=${dsid} dms=${dms} sps=${sps} sid=${State.sid.toLocaleString()} tsec=${(now - this.ms00) / 1000}`)
        ms0 = now, sid0 = State.sid, brd0 = this.brds
      }
    }

    if (useMoveAry) {
      TP.log > 0 && state0.logMoveAry(`${ident}:pre-evaluated moveAry`, tn)
      TP.log > 0 && console.warn(stime(this, ident), ':pre-evaluated moveAry')
      // TODO: check move.caps for moves that *were* blocked, but are not ok?
      debugger;
    } else try {
      TP.log > 0 && (console.groupCollapsed(`${stime(this, ident)} -> ${TP.colorScheme[sc]}#${tn}:`), group = true)
      moveAry = state0.moveAry = []
      // always include skipMove:
      let skipMove = this.skipMove(sc);    // this.gamePlay.history.unshift(skipMove)
      // placeStone/addStone is a NOOP
      gamePlay.incrBoard(skipMove)
      evalf(skipMove)                      // eval and set into moves & moveAry
      gamePlay.shiftMove()
      // generate MOVES (of otherColor[gamePlay.history[0].color] =~= stoneColor)
      let hexGen = new HexGen(this, tn - this.moveNumber, evalf)
      hexGen.gen() // TODO: respond to C-c to stop! (back to yield/next?)
      state0._nMove = state0.moveAry.length // evalSortMoves
      //let hexGenA = Array.from(hexGen) // invoke evalf(move) on each legalMove
      //TP.log > 1 && console.log(stime(this, ident), { moveAry, state0: state0.copyOf(), hexGenA })
      group && console.groupEnd()
    } catch (err) {
      group && console.groupEnd()
      throw err
    }
    state0.sortMoves(sc)  // descending bestValue[sc]
    state0.setBestHexState(moveAry[0])
    TP.log > 1 && state0.logMoveAry(ident, tn)
    return moveAry
  }
}

/**
 * 1. evalAndSortMoves as generator, so can yield the initial value; then sort and proceed with the good ones.
 * ... but: not the MOVE generator; store state of board at [leaf] nodes of search graph.
 * ... QQQ: do we store the whole hexMap? or just history or Board (from which we can recreate hexMap)? TIME vs SPACE
 * ... AAA: first try save hexMap; and nullify refs in obsolete STATES.
 * Also: keep 'allBoards' with link to the eval-node, so can find it even if not in first tier of nodes.
 * 1b. gen->[gen: Iterable, value: number]; sort on [2], 
 * 2. use internal HexMap<hex> to dodge all the graphics (now that it works)
 * 2b. read move0 to see which hex was updated
 * 3? maintain tree of forecast: prune when other player makes actual move; expand at the remaaining leafs.
 * 
 */

/** generate interesting Hex targets for next Move. */
class HexGen {
  // moves that kill move0.hex: scan each of 6 axies, using getCaptures()
  // moves near *my* last move (history[1])
  // all moves in district <= 7 (and later: 19)

  // Note: getCaptures() does assertInfluence & removeStone and then invokes undoRecs & undoInfluence
  // we *could* place the stone & evaluate the board before the undo
  // we *could* copy the hexMap state and keep it in the move tree
  // Q: is it more expensise to do/influence/capture/undo OR copy-hexMap?
  // Can we make a hexMap & Hex[] without Shapes/Graphics?

  // TODO: look for responses to (new?) threats: my hexes that are now under threat 
  // (which were not threatened in previous ply) even if they are in outer district!
  // conversely, check for attack moves to finish-off threats that I have against otherPlayer.

  // assert: history[0] is valid (because first move has been done)
  /**
   * 
   * @param planner 
   * @param depth for debugging: conditional breakpoint
   * @param evalFun 
   */
  constructor(public planner: Planner, public depth: number, public evalFun?: (move: Move) => void) { 
  }
  gamePlay = this.planner.gamePlay
  hexes = new Set<Hex>()
  hexMap = this.gamePlay.hexMap
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move 'curPlayer' made
  color = otherColor(this.move0.stoneColor)
  maxD = Math.min(10, Math.ceil(Math.sqrt(TP.tHexes)/2))
  hThreats = this.gamePlay.gStats.pStat(this.color).hThreats
  attemptDist = Array<number>(TP.nDistricts).fill(0) 
  legalDists = Array<number>(TP.nDistricts).fill(0)
  moveAry: Hex[]
  otherDists: IterableIterator<number>

  sxInfo: SxInfo = this.planner.sxInfo
  isOffAxis = false

  gen() {
    this.moveAry = []
    //yield* this.attackHex(this.move0.hex)
    if (this.move1) this.alignHex(this.move1.hex, 2, 2)
    for (let hex of this.hThreats) this.alignHex(hex, 4, 2)
    this.alignHex(this.move0.hex, undefined, 3)
    for (let d of this.adjacentDistricts(this.legalDists)) this.nInEachDistrict(d)
    if (this.moveAry.length <= TP.maxBreadth) 
      for (let d of this.otherDists) this.nInEachDistrict(d)
    return this.moveAry
  }

  enumAllDistricts() {
    let allDistricts = (TP.nHexes > 1) ? [0, 1, 2, 3, 4, 5, 6] 
      : (() => { let a = Array<number>(TP.nDistricts).fill(0); a.forEach((v, ndx) => a[ndx] = ndx); return a })()
    return allDistricts
  }
  adjacentDistricts(districts: number[]) {
    let districtsToCheck = new Set<number>()
    let otherDistricts = new Set<number>()
    districts.forEach((v, d) => {
      if (v == 0) { 
        otherDistricts.add(d)
      } else {
        // add each visited District and its immediate neighbor Districts
        districtsToCheck.add(d)
        let mhex0 = this.hexMap.district[d][0]
        let mlinks = mhex0.metaLinks
        for (let hex of Object.values(mlinks)) 
          districtsToCheck.add(hex.district)
      }
    })
    this.otherDists = otherDistricts.values()
    return districtsToCheck.values()
  }

  /** sample n hexes Per Dist. */
  nInEachDistrict(d: number) {
    let move0 = this.gamePlay.history[0], caps = move0.captured
    let hexAry = this.hexMap.district[d].filter(h => h.stoneColor == undefined && !caps.includes(h) && !this.hexes.has(h))
    let n = 0
    while (n++ < TP.nPerDist && hexAry.length > 0) {
      let hex = hexAry[Math.floor(Math.random() * hexAry.length)] // sample until we find nPerDist
      this.isLegal(hex) // { hexes.add(hex); evalFun(hex) }
      hexAry = hexAry.filter(h => h != hex)
    }
  }
  /** if hex is unchecked then run isMoveLegal(evalFun), mark as checked */
  isLegal(hex: Hex) {
    if (this.hexes.has(hex)) return false
    this.hexes.add(hex)
    if (this.sxInfo.ignoreSX(hex, this)) return false // if allStones are onAxis, ignore S/SW
    this.attemptDist[hex.district]++
    // evalFun(move) will process each legal Move:
    let legal = this.gamePlay.isMoveLegal(hex, this.color, this.evalFun)[0]
    if (legal) {
      this.legalDists[hex.district]++ // count legal Moves into each District
      this.moveAry.push(hex)
    }
    return legal
  }

  /** Hexes that an on-axis to the given Hex */
  alignHex(hex: Hex, maxD = this.maxD, maxN = Number.POSITIVE_INFINITY, maxT = Number.POSITIVE_INFINITY) {
    let nt = 0, dirs = Object.keys(hex.links) // directions with linked neighbors
    for (let dn of dirs) {
      let nHex = hex, dist = 0, nd = 0
      while ((nHex = nHex.links[dn]) && ++dist <= maxD && nd <= maxN && nt <= maxT) {
        if (!this.isLegal(nHex)) continue
        nd++; nt++
      }
    }
  }
}
class SxInfo {
  constructor(
    public gamePlay: GamePlay0
  ) {
    this.setSxInfo()
  }
  public allMetas: Hex[]    // all the Metas south of the metaLineC
  public metaLine: string[] // a line of metaHex: from move1.hex through center Hex
  public signature: string   // identify this board

  /** isSX(hex) if hex.metaLinks[Dir2] intersects the metaHexes on the axis from B[1] through District[0] (NW-SE = LR:horizontal) 
   * @param hex the Hex to test
   * @param hex0 the Hex where B[Move1]==history[0] was played
  */
  setSxInfo() {
    let move0 = this.gamePlay.history[this.gamePlay.history.length - 1] // first Move of game
    let sig = move0.board.signature   //`[${TP.mHexes}x${TP.nHexes}]${move0.board.id}`
    if (this.signature != sig) {
      let metaLine: Hex[] = []
      let hex0 = move0.hex
      let hexC = this.gamePlay.hexMap.district[0][0]
      let axisDir = Object.keys(hex0.metaLinks).find(dir => { // axis = revDir[this.dir1]
        metaLine.splice(0, metaLine.length, hex0)             // metaLine = [hex0]
        let nhex = hex0
        while ((nhex = nhex.metaLinks[dir]) && metaLine.push(nhex)) {
          if (nhex == hexC) {
            while ((nhex = nhex.metaLinks[dir]) && metaLine.push(nhex)) { } // the rest of metaLine
            return true // axis = dir
          }
        }
        return false
      })
      // ASSERT: dir2 intersects dir1
      let dir2: Dir2 = 'NE'  // Note: makeDistrict/metaMap uses nsTopo (even when nh==1) 
      let allSXMetas = this.gamePlay.hexMap.district.map(d => d[0]).filter((mhex, ndx, hexary) => {
        while (mhex = mhex.metaLinks[dir2])
          if (metaLine.includes(mhex)) return true
        return false
      })
      this.allMetas = allSXMetas
      this.metaLine = metaLine.map(h => h.Aname)
      this.signature = sig
      console.log(stime(this, `.setSXMeta: ${AT.ansiText(['green'], sig)}`), { metaLine, allSXMetas })
    }
  }
  ignoreSX(hex: Hex, ctx: { isOffAxis: boolean }) {
    /** true if allStones are on axis from h[0] to Center */
    if (ctx.isOffAxis) return false // once you're offAxis, you're always offAxis
    let offAxis = this.gamePlay.hexMap.allStones.find((hsc: HSC) => !this.metaLine.includes(hsc.Aname))
    ctx.isOffAxis = !!offAxis
    if (ctx.isOffAxis) return false
    /** AND the given Hex is in the SW: */
    return this.allMetas.includes(this.gamePlay.hexMap.district[hex.district][0])
  }
}
