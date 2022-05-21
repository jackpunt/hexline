import { M, Obj, stime } from "@thegraid/common-lib";
import { Board, GamePlay, GamePlayD, GamePlayOrig, Move } from "./game-play";
import { Hex } from "./hex";
import { runEventLoop } from "./hex-intfs";
import { WINARY } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, StoneColorRecord, stoneColorRecord, stoneColorRecordF, stoneColors, TP } from "./table-params";

type HexState = [Hex, State]
class MOVES extends Map<Hex,State>{}
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
export class State {
  static sid = 0
  //move: Move; 
  //color: StoneColor; 
  //value: number; 
  //winAry: WINARY
  /** for debugger: evaluated to depth (= tn+ ~nPlys) */
  eval: number = 0
  id: number; 
  moves: MOVES; 
  val: number[]  // unshift for each lookahead...
  bestValue: StoneColorRecord<number>; 
  fj: boolean 

  /**
   * @param move for doc/debug: last move to get to this state
   * @param color last player to placeStone; == move.color == history[0].color
   * @param v0 value to stoneColor0 [lh == 0]
   * @param winAry gStats; for winAny = gameOver(...winAry) // winAry[0] == this.board
   */
  constructor(public move: Move, public color: StoneColor, public readonly v0: number, public readonly winAry: WINARY) {
    this.bestValue = stoneColorRecord(v0, -v0)
    this.id = ++State.sid
  }
  upState(move: Move, color: StoneColor, value: number) {
    this.move = move
    this.color = color
    this.bestValue = stoneColorRecord(value, -value)
  }
  /** utility for logging an non-mutating copy for State */
  copyOf(): State {
    let s1 = Obj.objectFromEntries(this)
    ;(s1 as any)['value'] = M.decimalRound(s1.v0, 3)
    s1.bestValue = stoneColorRecordF(sc => M.decimalRound(s1.bestValue[sc], 3))
    s1['copyof'] = this
    return s1
  }
  get bvr2() { return M.decimalRound(this.bestValue[this.color], 2)}
  get bvr3() { return M.decimalRound(this.bestValue[this.color], 3)}
}
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

interface IPlanner {
  makeMap(mH: number, nH: number): void
  makeGamePlay(): void
  newGame(gamePlay: GamePlay): void
  // {
  //   this.makeWorker()
  //   this.planner = new Planner(new GamePlayD(gamePlay, this), this.index)
  // }
  roboMove(stop: boolean): void 

  makeMove(stone: Stone, table: Table): Promise<Hex>
}
/**
 * Planner: eval-node: makeState, find children, for [each] child: eval-node
 */
// TODO: assign planner to a Player; do all eval wrt that player
// so won't need -state2.bestValue
// remove Move from State; state.color should suffice (whose turn is it?)
// presumably can check history[0] to find "the move that got us here"
// but this way when a State is achieved by different means, we can use it.
// Note... board identity requires that [caps] are also the same; but not last-move
export class BasePlanner {
  roboRun = true  // set to FALSE to break the search.
  roboMove(run = true) { this.roboRun = run}

  gamePlay: GamePlayD
  weightVecs: Record<StoneColor, number[]>
  districtsToCheck = TP.nHexes > 1 ? [0, 1, 2, 3, 4, 5, 6] 
    : (() => { let a = Array<number>(TP.ftHexes(TP.mHexes)).fill(0); a.forEach((v, ndx) => a[ndx] = ndx); return a })()
  prevState: State // previous state
  get depth() { return this.gamePlay.history.length + 1 } // accounting for Stones we have played
  /** copy of gamePlay.turnNumber: gamePlay.history.length + 1 */
  moveNumber: number
  skipStateRec: Record<StoneColor, State>
  resignStateRec: Record<StoneColor, State>
  boardState: Map<string,State> = new Map<string,State>()

  /** make skipState or resignState for given color */
  skipMove(color: StoneColor) { return new Move(this.gamePlay.hexMap.skipHex, color, [], this.gamePlay) }
  resignMove(color: StoneColor) { return new Move(this.gamePlay.hexMap.resignHex, color, [], this.gamePlay) }

  constructor(gamePlay: GamePlayD, playerIndex: number) {
    this.myPlayerNdx = playerIndex
    this.myStoneColor = stoneColors[playerIndex]
    this.gamePlay = gamePlay  // downgraded to GamePlayD
    // compatible with statVector in stats.ts
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    let dStoneM0 = new Array<number>(nDist).fill(1, 0, nDist); dStoneM0[0] = 1
    // s0 = inControl, dMax, nStones, nInf, nAttacks, nAdj
    let scoreM0 = 1.3, dMaxM0 = 1, nStonesM0 = 1.1, nInfM0 = .3, nThreatsM0 = .2, nAttacksM0 = .5, nAdjM0 = .1
    let wv0 = dStoneM0.concat([scoreM0, dMaxM0, nStonesM0, nInfM0, nThreatsM0, nAttacksM0, nAdjM0])
    let dStoneM1 = new Array<number>(nDist).fill(1, 0, nDist); dStoneM1[0] = .8
    let scoreM1 = 1.4, dMaxM1 = .9, nStonesM1 = 1.2, nInfM1 = .55, nThreatsM1 = .25, nAttacksM1 = .6, nAdjM1 = .2
    let wv1 = dStoneM1.concat([scoreM1, dMaxM1, nStonesM1, nInfM1, nThreatsM1, nAttacksM1, nAdjM1])
    this.weightVecs = stoneColorRecord(wv0, wv1)
  }
  /** time at last yield (or initial makeMove) */
  ms0: number
  ms00: number
  yieldMs: number      // compute this long before voluntary yield
  maxDepth: number
  myPlayerNdx: number // my Player.index
  myStoneColor: StoneColor // from myPlayerIndex
  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table: Table): Promise<Hex> {
    this.ms0 = this.ms00 = Date.now()
    this.maxDepth = Number.NEGATIVE_INFINITY
    let gamePlay = this.gamePlay
    this.syncToGame(table.gamePlay)   // setHexMap, allBoards, turnNumber
    // NOW: we are sync'd with mainGame...

    this.yieldMs = Math.max(20, 5* (TP.maxPlys + TP.maxBreadth - 7)) // 5 * TP.maxPlys // 

    let sid0 = State.sid, ms0 = Date.now() - 1

    let fillMove: (hex: Hex | PromiseLike<Hex>) => void, failMove: (reason?: any) => void 
    let movePromise = new Promise<Hex>((fil, rej) => {
      fillMove = fil; failMove = rej
    })

    let firstMove = () => {
      State.sid = sid0 = 0
      let lastDist = TP.ftHexes(TP.mHexes) - 1
      let hex = gamePlay.hexMap.district[lastDist][0]
      fillMove(hex)
    }

    let dispatchMove = (hex: Hex, state: State) => {
      this.doMove(hex, stone.color) // placeStone on our hexMap & history
      let tn = this.moveNumber
      let dsid = State.sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      console.log(stime(this, `.makeMove: MOVE#${tn} = ${stone.color}@${hex.Aname}`), `state=`, state.copyOf(), 
        { sps, dms, dsid: dsid.toLocaleString(), maxD: this.maxDepth })
      this.prevState = state
      fillMove(hex)
    }
    //let [win, winAry] = gamePlay.gStats.updateStats() // unused? set baseline for lookahead ??
    if (this.moveNumber == 1) {
      firstMove()
    } else {
      // try get previously evaluated State & MOVES:
      // righteous: from our own previous analysis: /* state0 = this.prevState?.moves?.get(hex) ||*/
      this.boardState.clear() // todo: keep the subset derive from current/actual Moves/board
      let state0 = this.evalState(this.gamePlay.history[0]) // history[0] placed by syncGame
      this.lookaheadDeep(state0, stone.color).then((hexState: HexState) => dispatchMove(hexState[0], hexState[1]))
    }
    return movePromise
  }
  /** do move from main.history: translate hex */
  doHistoryMove(moveg: Move) {
    this.doMove(moveg.hex.ofMap(this.gamePlay.hexMap), moveg.stoneColor)
  }
  /** 
   * placeStone(); closeUndo()
   * @param moveg.hex may be from this.gamePlay.hexMap or original.gamePlay.hexMap 
   */
  doMove(hex: Hex, color: StoneColor) {
    let move = this.placeStone(hex, color)
    this.evalState(move)
    this.gamePlay.undoRecs.closeUndo()
    return move
  }
  /** make Move, unshift, addStone -> captured  
   * @param pushUndo if defined: push the current undoRecs, open a new undoRecs.
   */
  placeStone(hex: Hex, color: StoneColor, pushUndo?: string): Move {
    let gamePlay = this.gamePlay
    let move0 = new Move(hex, color, [], gamePlay)
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
    let gamePlay = this.gamePlay
    if (popUndo) gamePlay.undoRecs.closeUndo().restoreUndo() // like undoStones(); SHOULD replace captured Stones/Colors
    else gamePlay.undoRecs.closeUndo().pop()
    gamePlay.shiftMove()
  }

  syncToGame(gamePlay: GamePlay) {
    let main = gamePlay.history, ours = this.gamePlay.history
    // our extra moves cannot be useful [if there has been some Undo on the mainGame]
    while (ours.length > main.length) this.unplaceStone(ours[0])
    let m = 0    // number of Moves to retain on ours.history:
    for (; main.length-m-1 >= 0 && ours.length-m-1 >= 0; m++) {
      if (main[main.length-m-1].Aname != ours[ours.length-m-1].Aname) break // skip oldest moves common to both
    }
    while (ours.length > m) this.unplaceStone(ours[0]) // all the Moves in ours are valid

    // reset all repCounts; [do NOT remove Boards that are no longer 'accessible']
    let history = this.gamePlay.history, allBoards = this.gamePlay.allBoards, bs = this.boardState
    for (let [id, board] of allBoards.entries()) {
      board.setRepCount(history)
      // space-time tradeoff: keep evaluated Board/Ids/States in memory?
      // if (board.setRepCount(history) == 0) {
      //   bs.delete(id)
      //   allBoards.delete(id)
      // }
    }

    // apply otherPlayer and/or manual Moves; appy mainGame Moves in proper order:
    while (main.length > ours.length) this.doHistoryMove(main[main.length - ours.length - 1])
    this.moveNumber = ours.length + 1
  }

  /** 
   * Inject value into State representing the current board.
   * @param move  for documentation/debugging: move that brought us to this state
   * @param state1 [new State(value)] OR [fill state1 with move, color] then set bestValue, fj, eval, winState
   */
  evalState(move: Move, state1?: State): State {
    let gamePlay = this.gamePlay, color = move.stoneColor, v0: number
    let board = move.board, boardId = board.id
    //let [boardId, resign] = gamePlay.boardId 
    let state = this.boardState.get(boardId) // reuse State & bestValue
    if (state) {
      //value = state.bestValue[stoneColor0]
      if (!state1) state1 = state     // TODO: what to do with 'eval'
      state1.upState(move, color, state.bestValue[stoneColor0])
      state1.eval = state.eval    // #of Moves to achieve this board (this.depth-1)
    } else {
      if (!state1) {
        let [win, winAry] = gamePlay.gStats.updateStats(board)  // calc stats & score for VP win
        let c0 = stoneColor0, c1 = stoneColor1
        let weightVec = this.weightVecs[this.myStoneColor]
        let s0 = gamePlay.gStats.getSummaryStat(c0, weightVec)
        let s1 = gamePlay.gStats.getSummaryStat(c1, weightVec)
        v0 = s0 - s1 // best move for c0 will maximize value
        state1 = new State(move, color, v0, winAry) // moves is undefined
        state1.eval = gamePlay.history.length    // #of Moves to achieve this board (this.depth-1)
        //if (win !== undefined) console.log(stime(this, `.evalState: win!${win} ${state1.id} state1=`), state1)
      } else {
        //state1.upState(move, color, state1.bestValue[stoneColor0]) // nothing to do...
      }
    }
    state1.fj = (move.captured.length == 0 && move.hex.isThreat(otherColor(color)))
    this.maxDepth = Math.max(this.maxDepth, state1.eval)   // note how deep we have gone... (for logging)
    let win = gamePlay.gStats.gameOver(...state1.winAry)   // check for resign, stalemate
    this.winState(state1, win)                             // adjust value if win/lose
    if (TP.boards && !state) this.boardState.set(boardId, state1)
    return state1
  }
  /** state.bestValue = +/-Infinity [if I win/lose] */
  winState(state: State, win: StoneColor): StoneColor {
    if (win !== undefined) {
      let value = (win === stoneColor0) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      if (Number.isNaN(value)) debugger;
      state.bestValue = stoneColorRecord(value, -value)
      console.log(stime(this, `.winState: win!${win} ${state.id} state1=`), state)
    }
    return win
  }

  logMoveAry(ident: string, state0: State, moveAry: HexState[], bestState?: State) {
    let tn = this.depth
    console.log(stime(this, `${ident}(${-state0.bvr2}) turn=${tn} moveAry =`),
      moveAry.map(([h, s]) => [s.move, s.eval, s.fj ? '-' : s.move.captured.length ? 'c' : s.eval > tn ? '+' : ' ',
      s.move.Aname, s.id, M.decimalRound(s.v0, 3), s.bvr3,
      (h == bestState?.move.hex) ? '*' : ' ', s.move.board.toString()]))
  }
  /** used in groupCollapsed(lookahead) */
  logId(state0: State, nPlys: number) {
    let tn = this.depth, sc = otherColor(state0.color)
    let mov0 = this.gamePlay.history[0]
    let gid0 = `${nPlys}/${TP.maxPlys} after ${mov0.Aname}#${tn-1}(${state0.bvr2})`
    let gid1 = `${mov0.board?.id}#${mov0.board.repCount} ${TP.colorScheme[sc]}#${tn}`
    return `${gid0}: ${gid1}->`
  }

  logAndGC(ident: string, state0: State, sid0: number, ms0: number, moveAry: HexState[], bestState: State, nPlys: number, stoneColor: string, gc = true) {
    if (TP.log > 0 || this.depth == this.moveNumber) {
      let dsid = State.sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      this.logMoveAry(ident, state0, moveAry, bestState)
      let bestValue = bestState.bvr3
      let bestHex = bestState.move.hex, Aname = bestHex.Aname, nBoards = this.gamePlay.allBoards.size
      console.log(stime(this, `${ident}X:`), nPlys, stoneColor, { Aname, bestHex, bestValue, sps, dsid, dms, bestState: bestState.copyOf(), sid: State.sid, nBoards })
    }
    if (TP.log == 0 && this.depth == this.moveNumber) { // delete a bunch of States:
      // moveAry[I..J].moves: [hexI, state1-I] ... [hexJ, state1-J]
      // state1-I.moves: [hexK, state2-K] ... [hexL, state2-L] --> sstate1-I.moves = undefined
      let bestMoves = bestState.moves
      if (gc) for (let [hex, state1] of moveAry) {
        state1.moves = undefined // remove ALL the Map<Hex,State>
        state1['agc'] = this.depth
      }
      bestState.moves = bestMoves
    }
  }
  /** show progress in log, how much of breadth is done */
  nth = 0;

  lookaheadInit(state0: State, stoneColor: StoneColor): HexState[] {
    // ASSERT: no lookaheadDeep; maybe lookaheadShallow [for fjCheck]
    return this.evalAndSortMoves(state0, stoneColor) // generate first approx of possible moves
  }
  moveAryBreak(state1a: State, breadth: number, bestState: State): boolean {
    let s1v = state1a.bestValue[state1a.color], bsv = bestState.bestValue[state1a.color]
    return !this.roboRun || breadth < 0 || (s1v + .01) < Math.min(bestState.v0, bsv) || bsv == Number.POSITIVE_INFINITY
  }
  /** allow limited dogfight analysis */
  fjCheckP(state1: State) { return state1.fj && (this.depth < this.moveNumber + TP.maxPlys + 1)}
  nPlysCheck2(nPlys: number, fjCheck: boolean, ) { return !fjCheck ? nPlys : Math.max(nPlys + (nPlys % 2), 2) } // even number > 2
  nPlysCheckE(nPlys: number, fjCheck: boolean, ) { return !fjCheck ? nPlys : this.nPlysCheck2(nPlys, fjCheck) + 1 - this.myPlayerNdx }

  /** return the better HexState (from POV of sc) */
  maxBestValue(bestHexState1: HexState, bestHexState2: HexState, sc: StoneColor) {
    // let state1 = bestHexState1[1], bv1 = state1.bestValue[sc], sid1 = state1.id
    // let state2 = bestHexState2[1], bv2 = state2.bestValue[sc], sid2 = state2.id
    // if (!Number.isFinite(bv1) || !Number.isFinite(bv2)) 
    //   console.log(stime(this, `.maxBestValue:`), {sid1, bv1, state1, sid2, bv2, state2})
    return (bestHexState1[1].bestValue[sc] > bestHexState2[1].bestValue[sc]) ? bestHexState1 : bestHexState2 // MAX
  }

  /** state0.bestValue = -state2.bestValue */
  setBestValue(state0: State, bestHexState: HexState) {
    let [hex, state2] = bestHexState
    let v2 = state2.bestValue[stoneColor0], v0 = state0.bestValue[stoneColor0]
    let value = (Number.isFinite(v2) && Number.isFinite(v0)) ? (v2 * TP.pWeight + v0 * (1 - TP.pWeight)) : v2
    if (Number.isNaN(value)) debugger;
    state0.bestValue = stoneColorRecord(value, -value)
    state0.eval = state2.eval
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
  async lookaheadDeep(state0: State, stoneColor: StoneColor, nPlys?: number, breadth = TP.maxBreadth): Promise<HexState> {
    let isTop = (nPlys === undefined) ? (nPlys = TP.maxPlys, true) : false
    if (isTop) this.nth = breadth
    try {
      TP.log > 0 && console.groupCollapsed(`${stime(this, `.lookaheadDeep`)}-${this.logId(state0, nPlys)}`)
      let sid0 = State.sid, ms0 = Date.now(), brd0 = this.brds // current state id

      let moveAry = this.evalAndSortMoves(state0, stoneColor)  // bestState.bestValue = -state0.
      let bestHexState = moveAry[0], bestHexState1: HexState
      if (nPlys == 0) return bestHexState
      for (let [hex1, state1a] of moveAry) {                   // hex = state1a.move.hex
        if (isTop) this.nth = breadth - 1
        if (this.moveAryBreak(state1a, --breadth, bestHexState[1])) break
        if (nPlys - 1 > 0) {
          bestHexState1 = await this.evalMoveInDepth(hex1, stoneColor, nPlys - 1, state1a) // state1.bestValue=MIN(-state2.bestValue)
        } else {
          bestHexState1 = this.evalMoveShallow(hex1, stoneColor, 0, state1a) // nPlys-1 == 0
        }
        bestHexState = this.maxBestValue(bestHexState1, bestHexState, stoneColor)
      }
      this.setBestValue(state0, bestHexState)
      this.logAndGC(`.lookaheadDeep:`, state0, sid0, ms0, moveAry, bestHexState[1], nPlys, stoneColor, false)

      // timers and voluntary yield:
      let dsid = State.sid - sid0, now = Date.now(), dmc = now - this.ms0, depth = this.depth - this.moveNumber
      let dms = now - ms0, dmy = -1, sps = M.decimalRound(1000 * dsid / dms, 0), dbd = this.brds - brd0 
      if (TP.yield && dmc > this.yieldMs) {  // compute at least 10 -- 100 ms
        await runEventLoop()                 // voluntary yield to allow event loop (& graphics paint)
        this.ms0 = Date.now()
        dmy = this.ms0 - now
      }
      if (TP.log > 0 || dmy > -1) console.log(stime(this, `.lookaheadDeep timers:`),
        `b=${this.nth} depth=${depth} dmc=${dmc} dmy=${dmy} dbd=${dbd} dsid=${dsid} dms=${dms} sps=${sps} sid=${State.sid.toLocaleString()} tsec=${(now - this.ms00) / 1000}`)

      // returning a State tells allowEventLoop to terminate with: dispatchMove(bestState)
      TP.log > 0 && console.groupEnd()
      return bestHexState
    } catch (err) {
      TP.log > 0 && console.groupEnd()
      throw err
    }
  }

  /** 
   * PlaceStone(hex, color) -> state1; lookahead recursively to find/estimate bestValue
   * @param hex play Stone to Hex and evaluate the State
   * @param stoneColor place stoneColor on hex; see how good that is.
   * @param nPlys evalState(move), then lookahead (nPlys, other) to obtain bestValue of move. [default: 0 --> no lookahead (unless fjCheck)]
   *              TODO: callers use evalMoveShallow when nPlys = 0, 1
   *              if nPlys = 0; generate/evalState(stoneColor, Move(hex, stoneColor))
   * @param state1 Move(hex, color) -> state1; set state1.eval & state1.bestValue (nPlys)
   * @return hex, !!state1 ? (the better of bestState, state1) : newState(move(hex, stoneColor), stoneColor)
   */
  async evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number = 0, state1: State): Promise<HexState> {
    if (nPlys > 0 || !state1) {
      let move = this.placeStone(hex, stoneColor, `eMID`)  // new Move(hex, color) -> addStone -> ... state1 [eval=0]
      state1 = this.evalState(move, state1)
      let win = this.gamePlay.gStats.winAny
      // state1: new Move(hex, color) evaluated @ depth
      if (win === undefined) {
        // move into jeopardy [without capturing] is generally bad: (but *maybe* the stone is untakable...)
        // get a better assessment (& likely lower the ranking of this move)
        let fjCheck = this.fjCheckP(state1) // or just state1.fj??
        if (nPlys > 0 || fjCheck) {
          let nPlys2 = this.nPlysCheckE(nPlys, fjCheck)
          // DFS-min/max: find opponent's best move against state1.move:
          let [hex2, state2] = await this.lookaheadDeep(state1, otherColor(stoneColor), nPlys2)
          TP.log > 1 && console.log(stime(this, `.evalMoveInDepth: nPlys: ${nPlys} after fjCheck`),
            { move: move.Aname, fj: state1.fj, bestValue: state1.bvr3, state2: state2.copyOf() })
          TP.log > 0 && console.log(stime(this, `.evalMoveInDepth: nPlys: ${nPlys} bvr2= ${state1.bvr2}`),
            { move1: move.Aname, state1: state1.copyOf(), move2: state2.move.Aname, state2: state2.copyOf() })
        }
      }
      TP.log > 0 && console.log(stime(this, `.evalMoveInDepth: nPlys: ${nPlys} bvr2= ${state1.bvr2}`),
        { move1: move.Aname, state1: state1.copyOf() })
      this.unplaceStone(move, true)
    }
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
    try {
      TP.log > 0 && console.groupCollapsed(`${stime(this, `.lookaheadShallow${this.fjCheckP(state0)?'-':'+'}`)}:${this.logId(state0, nPlys)}`)
      let sid0 = State.sid, ms0 = Date.now() // current state id
      let moveAry = this.evalAndSortMoves(state0, stoneColor) // evalAndSortMoves(), skipMove()
      let bestHexState = moveAry[0]
      if (nPlys == 0) return bestHexState
      for (let [hex, state1a] of moveAry) {                              // hex = state1a.move.hex
        if (this.moveAryBreak(state1a, --breadth, bestHexState[1])) break
        let bestHexState1 = this.evalMoveShallow(hex, stoneColor, nPlys - 1, state1a) // eval move and update state1a
        bestHexState = this.maxBestValue(bestHexState1, bestHexState, stoneColor)
      }
      this.setBestValue(state0, bestHexState)
      this.logAndGC(`.lookaheadShallow`, state0, sid0, ms0, moveAry, bestHexState[1], nPlys, stoneColor, false)
      TP.log > 0 && console.groupEnd()
      return bestHexState
    } catch (err) {
      TP.log > 0 && console.groupEnd()
      throw err
    }
  }

  /** set state.value/bestValue; lookahead only if state.fj & !win 
   * @param hex play Stone to hex
   * @param stoneColor Stone being played
   * @parma nPlys lookahead [0,1,2] (for fjCheck)
   * @param state1a the resultant state from move(hex,color) (if known)
   * @return state1a (or create if not supplied)
   */
  evalMoveShallow(hex: Hex, stoneColor: StoneColor, nPlys: number, state1a: State): HexState {
    let move = this.placeStone(hex, stoneColor, `eMS`)     // new Move(hex, color) -> addStone -> ... state1
    let state1 = this.evalState(move, state1a), win = this.gamePlay.gStats.winAny
    let ind = state1.fj ? '-' : !move.captured ? '!' : move.captured.length > 0 ? `${move.captured.length}` : ' '
    let winInd = (win !== undefined) ? ` --> win: ${TP.colorScheme[win]}` : ''
    TP.log > 0 && console.log(stime(this, `.evalMoveShallow: nPlys: ${nPlys}${winInd}`),
      { move: move.Aname, fj: ind, bestValue: state1.bvr3, state1: state1.copyOf() })

    let fjCheck = this.fjCheckP(state1), prefj0 = state1.bestValue[stoneColor0]
    if (win === undefined && (nPlys > 0 || fjCheck)) {
      let nPlys2 = this.nPlysCheckE(nPlys, fjCheck)
      let [hex2, state2] = this.lookaheadShallow(state1, otherColor(stoneColor), nPlys2)
      if (state1.fj && state2.fj) {
        let bv1 = state1.bestValue[stoneColor0]
        let value = Number.isFinite(bv1) ? (bv1 + prefj0) / 2 : bv1
        if (Number.isNaN(value)) debugger;
        state1.bestValue = stoneColorRecord(value, -value)
        state1.eval = state2.eval
      }
      TP.log > 1 && console.log(stime(this, `.evalMoveShallow: nPlys: ${nPlys} after fjCheck`),
        { move: move.Aname, fj: state1.fj, bestValue: state1.bvr3, state2: state2.copyOf() })
      TP.log > 0 && console.log(stime(this, `.evalMoveShallow: nPlys: ${nPlys} best= ${state1.bvr2}`),
        { move1: move.Aname, state1: state1.copyOf(), move2: state2.move.Aname, state2: state2.copyOf() })
    }
    this.unplaceStone(move, true)
    return [hex, state1]
  }
  get brds() { return this.gamePlay.allBoards.size;}
  /** 
   * Initialize state0 with hex & bestHex = skipHex(-Infinity)
   * 
   * find some MOVES from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * 
   * @param stoneColor from state0, place a Stone of this color; sort for that color
   * @return with state0.moves sorted, descending from best initial value
   */
  evalAndSortMoves(state0: State, stoneColor: StoneColor): HexState[] { // Generator<void, State, unknown>
    const tn = this.depth, other = otherColor(stoneColor) // <--- state0.stoneColor
    const gamePlay = this.gamePlay
    const moves = state0.moves ? state0.moves : (state0.moves = new MOVES())
    let ms0 = Date.now(), sid0 = state0.id, brd0 = this.brds
    const evalf = (move: Move) => {
      // From isLegalMove: move = placeStone(hex, color) // ASSERT move.color == stoneColor
      let state1 = this.evalState(move), win = gamePlay.gStats.winAny
      let fjCheck = this.fjCheckP(state1)
      if (fjCheck && win === undefined) {
        this.lookaheadShallow(state1, other, 2) // lower state1.bestValue
      }
      moves.set(move.hex, state1)
      let dsid = State.sid - sid0, now = Date.now(), dmc = now - this.ms0, dbd = this.brds - brd0
      let depth = this.depth - this.moveNumber, dms = now - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      if (depth == 1 && (TP.log > 0 || dms > this.yieldMs)) {
        console.log(stime(this, `.evalAndSortMoves timers:`),
          `b=${this.nth} depth=${depth} dmc=${dmc} dmy=${0} dbd=${dbd} dsid=${dsid} dms=${dms} sps=${sps} sid=${State.sid.toLocaleString()} tsec=${(now - this.ms00) / 1000}`)
        ms0 = now, sid0 = State.sid, brd0 = this.brds
      }
    }
    if (state0['agc']) 
      console.log(stime(this, `.evalSortMoves: looking for gc'd moves in state0`), state0.copyOf())
    TP.log > 0 && console.groupCollapsed(`${stime(this, `.evalAndSortMoves after ${state0.move.Aname}#${tn-1}`)} -> ${TP.colorScheme[stoneColor]}#${tn}:`)
    if (moves.size >= 0) {                  // for now: recalc ALL moves[hex]->state
      let skipMove = this.skipMove(stoneColor);
      // placeStone/addStone is a NOOP
      gamePlay.incrBoard(skipMove)
      evalf(skipMove)                      // eval and set into moves
      gamePlay.shiftMove()
      // generate MOVES (of otherColor[gamePlay.history[0].color] =~= stoneColor)
      let hexGen = new HexGen(gamePlay, this.districtsToCheck, evalf).gen()
      let hexGenA = Array.from(hexGen) // checkHex invokes evalf(move) on each legalMove
      TP.log > 1 && console.log(stime(this, `.evalAndSortMoves: after ${state0.move?.Aname}#${tn-1}`), {moves: state0.moves, state0: state0.copyOf(), hexGenA})
    } else {
      // log: 'using recycled moves'
      TP.log > 0 && this.logMoveAry(`.evalAndSortMoves: afer ${state0.move?.Aname}#${tn-1}: using recycled moves`, state0, entriesArray(moves))
    }
    if (moves.size == 0) {
      TP.log > 1 && console.log(stime(this, `.evalAndSortMoves(${state0.move?.Aname}#${tn-1}): moveAry empty, state:`), state0.copyOf())
    }
    TP.log > 0 && console.groupEnd()
    let moveAry = Array.from(moves.entries()).sort(([ha, sa], [hb, sb]) => sb.bestValue[stoneColor] - sa.bestValue[stoneColor]) // descending
    TP.log > 1 && this.logMoveAry(`.evalAndSortMoves: after${state0.move?.Aname}#${tn-1}`, state0, moveAry)
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
export class Planner extends BasePlanner {

}
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
  constructor(private gamePlay: GamePlayD, private districts: number[] = [0, 1, 2, 3, 4, 5, 6], private evalFun?: (move: Move) => void) { }
  hexes = new Set<Hex>()
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move 'curPlayer' made
  color = otherColor(this.move0.stoneColor)
  density = TP.nPerDist / (this.gamePlay.hexMap.district[0].length)

  ; *gen() {
    //yield* this.attackHex(this.move0.hex)
    if (this.move1) yield* this.adjacentHex(this.move1.hex)
    yield* this.alignHex(this.move0.hex)
    for (let d of this.districts) yield* this.allHexInDistrict(d)
  }

  *checkHex(hexIter: Iterable<Hex>) {
    for (let hex of hexIter) {
      if (this.isLegal(hex)) yield hex  // isLegalMove
    }
  }

  /** sample n hexes Per Dist. */
  *allHexInDistrict(d: number) {
    let move0 = this.gamePlay.history[0], caps = move0.captured
    let hexAry = this.gamePlay.hexMap.district[d].filter(h => h.stoneColor == undefined && !caps.includes(h) && !this.hexes.has(h))
    let n = 0
    while (n++ < TP.nPerDist && hexAry.length > 0) {
      let hex = hexAry[Math.floor(Math.random() * hexAry.length)]
      if (this.isLegal(hex)) yield hex
      hexAry = hexAry.filter(h => h != hex)
    }
  }
  isLegal(hex: Hex, density?: number) {
    if (this.hexes.has(hex)) return false
    this.hexes.add(hex)
    if (density && (Math.random() >= this.density)) return false
    // evalFun(move) will process each legal Move:
    return this.gamePlay.isMoveLegal(hex, this.color, this.evalFun)[0]
  }

  /** alignHex with range = 1 */
  adjacentHex(hex: Hex) {
    return this.checkHex(Object.values(hex.links))  
  }

  /** Hexes that an on-axis to the given Hex */
  alignHex(hex: Hex) {
    let genHex = this.radialHex(hex)
    return this.checkHex(genHex)
  }
  ; *radialHex(hex: Hex) {
    let dirs = Object.keys(hex.links) // directions with linked neighbors
    for (let dn of dirs) {
      let nHex = hex
      while (nHex = nHex.links[dn]) yield nHex
    }
    return
  }


}