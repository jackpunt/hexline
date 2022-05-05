import { M, Obj, S, stime, Undo } from "@thegraid/createjs-lib";
import { GamePlay0, GamePlayD, GamePlayOrig, Move, Mover, Player, Undo0 } from "./game-play";
import { Hex } from "./hex";
import { HexEvent } from "./hex-event";
import { allowEventLoop } from "./hex-intfs";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColorRecord, stoneColorRecordF, TP } from "./table-params";

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
class State {
  static sid = 0
  //move: Move; color: StoneColor; value: number; 
  readonly value: number
  id: number; 
  moves: MOVES; bestValue: number; fj: boolean 
  constructor(public move: Move, public color: StoneColor, value: number) {
    this.value = value
    this.bestValue = value
    this.id = ++State.sid
  }
  /** utility for logging an non-mutating copy for State */
  copyOf(): State {
    let s1 = Obj.objectFromEntries(this)
    ;(s1 as any)['value'] = M.decimalRound(s1.value, 3)
    s1.bestValue && (s1.bestValue = M.decimalRound(s1.bestValue, 3))
    s1['copyof'] = this
    return s1
  }
}


class RoboBase implements Mover {
  table: Table
  player: Player

  constructor(table: Table, player: Player) {
    this.table = table
    this.player = player
  }
  
  /** 
   * place this Stone
   */ 
  makeMove(stone: Stone) {
    let move: Move
    // on first move, we may be asked to place OtherPlayer's first stone.
    if (stone.color != this.player.color) return this.firstMove(stone)
    return 
  }
  firstMove(stone: Stone) {

  }
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
export class Planner {
  running = false
  roboStop = false  // set to TRUE to break the search.

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
  private endState(hex: Hex, state0: State) { 
    let color = otherColor(state0.move.stoneColor)
    let state = new State(new Move(hex, color), color, Number.NEGATIVE_INFINITY)
    //state.bestValue = -state0.bestValue
    state.move.eval = state0.move.eval
    return state
  }
  skipState(state0: State) { return this.endState(this.gamePlay.hexMap.skipHex, state0) }
  resignState(state0: State) { return this.endState(this.gamePlay.hexMap.resignHex, state0) }

  constructor(gamePlay: GamePlay0, player: Player) {
    this.gamePlay = new GamePlayD(gamePlay, player)  // downgrade to GamePlayC
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

  /** 
   * Make a State object with simple value of current board.
   * @param color evaluate from the POV of the given color
   * @param move  for documentation/debugging: move that brought us to this state
   */
  evalState(color: StoneColor, move = this.gamePlay.history[0], state1?: State): State {
    let weightVec = this.weightVecs[color]
    let other = otherColor(color)
    let s0 = this.gamePlay.gStats.getSummaryStat(color, weightVec)
    let s1 = this.gamePlay.gStats.getSummaryStat(other, weightVec)
    let value = s0 - s1 // best move for color will maximize value
    //console.log(stime(this, `.evalState:`), { move, color, value, bestValue: value, hex, bestHex: hex })
    move.eval = this.depth
    if (state1) {
      state1.move = move
      state1.bestValue = value
      state1.color = color
    } else {
      state1 = new State(move, color, value ) // moves is undefined, eval = 0
    }
    return state1
  }
  winState(state: State, win: StoneColor): StoneColor {
    if (win !== undefined) state.bestValue = (win === state.color) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY

    return win
  }
  stateWin(state: State) {
    if (state.bestValue == Number.POSITIVE_INFINITY) return otherColor(state.move.stoneColor)
    if (state.bestValue == Number.NEGATIVE_INFINITY) return state.move.stoneColor
    return undefined
  }
  logMoveAry(moveAry: [Hex, State][], bestState: State) {
    let tn = this.depth
    console.log(stime(this, `.lookaheadDeepX: turn=${tn} moveAry =`),
      moveAry.map(([h, s]) => [s.move, s.move.eval, s.fj ? '-' : s.move.captured.length ? 'c' : s.move.eval > tn + 1 ? '+' : ' ',
      s.move.Aname, s.id, M.decimalRound(s.value, 3), M.decimalRound(s.bestValue, 3),
      (h == bestState.move.hex) ? '*' : ' ', s.move.board.id]))
  }
  logId(stoneColor: StoneColor, nPlys: number) {
    let tn = this.depth
    let gid0 = `${nPlys}/${TP.maxPlys} after ${TP.colorScheme[otherColor(stoneColor)]}#${tn-1}`
    let mov0 = this.gamePlay.history[0]
    let gid1 = `${mov0.hex.Aname} ${mov0.board?.id} ${TP.colorScheme[stoneColor]}#${tn}`
    return `${gid0}->${gid1}->`
  }
  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table?: Table) {
    this.running = true // TODO: maybe need a catch?
    let gamePlay = this.gamePlay, mainGame = gamePlay.original, hex: Hex
    gamePlay.importBoards(table.gamePlay) // prune back to the current Boards

    let sid0 = State.sid, ms0 = Date.now() - 1, tn = this.moveNumber = table.gamePlay.turnNumber

    let firstMove = () => {
      State.sid = sid0 = 0
      let lastDist = TP.ftHexes(TP.mHexes) - 1
      let hex = gamePlay.hexMap.district[lastDist][0]
      dispatchMove(new State(new Move(hex, stone.color), stone.color, 0))
    }
    let dispatchMove = (state: State) => {
      this.doMove(state.move) // placeStone on our hexMap & history
      let dsid = State.sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      console.log(stime(this, `.makeMove: MOVE#${tn} = ${state.move.Aname}`), `state=`, state.copyOf(), {sps, dms, dsid})
      if (table) {
        let origMap = table.gamePlay.hexMap
        let hex0 = state.move.hex.ofMap(origMap)
        table.hexMap.showMark(hex0)
        table.dispatchEvent(new HexEvent(S.add, hex0, stone)) //
      }
      this.prevState = state
      this.running = false
    }
    this.syncToGame(this.gamePlay.original) // if win, then why are we here? return skipMove?
    let win = gamePlay.gStats.update()
    // NOW: we are sync'd with mainGame...
    if (gamePlay.history.length < 1) return firstMove()
    
    // try get previously evaluated State & MOVES:
    // righteous: from our own previous analysis: /* state0 = this.prevState?.moves?.get(hex) ||*/
    let state0 = this.evalState(otherColor(stone.color))
    allowEventLoop(this.lookaheadDeep(state0, stone.color), (state: State) => dispatchMove(state))
  }
  /** 
   * like placeStone(); closeUndo()
   * @param moveg.hex may be from this.gamePlay.hexMap or original.gamePlay.hexMap 
   */
  doMove(moveg: Move) {
    this.placeStone(moveg.hex.ofMap(this.gamePlay.hexMap), moveg.stoneColor)
    this.gamePlay.undoRecs.closeUndo()
  }
  /** make Move, unshift, addStone -> captured  
   * @param pushUndo if true: push the current undoRecs, open a new undoRecs.
   */
  placeStone(hex: Hex, color: StoneColor, pushUndo?: string): Move {
    let gamePlay = this.gamePlay, move0 = new Move(hex, color, [])
    gamePlay.history.unshift(move0)
    if (pushUndo) this.gamePlay.undoRecs.saveUndo(pushUndo).enableUndo() // placeStone
    gamePlay.addStone(hex, color)        // may invoke captureStone() -> undoRec(Stone & capMark)
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
    gamePlay.history.shift()
    move && gamePlay.allBoards.delete(move.board?.id)
  }

  syncToGame(mainGame: GamePlayOrig) {
    let main = mainGame.history, ours = this.gamePlay.history
    // our extra moves cannot be useful [if there has been some Undo on the mainGame]
    while (ours.length > main.length) this.unplaceStone(ours[0])
    let m = 0    // number of Moves to retain on ours.history:
    for (; main.length-m-1 >= 0 && ours.length-m-1 >= 0; m++) {
      if (main[main.length-m-1].Aname != ours[ours.length-m-1].Aname) break // skip oldest moves common to both
    }
    while (ours.length > m) this.unplaceStone(ours[0])
    // apply otherPlayer and/or manual Moves; appy mainGame Moves in proper order:
    while (main.length > ours.length) this.doMove(main[main.length - ours.length - 1])
  }
  /** 
   * lookahead from current State; with its potential MOVES
   * try someMoves, update State values looking maxPlys deep;
   * 
   * otherColor [state0.color] has just moved.
   * 
   * @param state0 other player has left board in state0 (which we may have foreseen & evaluated)
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @param nPlys how deep to go; 0 for immediate eval, 2 for fjCheck, OR count down from TP.maxPlys
   * @param breadth typically = TP.maxBreadth; for free-jeopardy it may be lower = Min(TP.maxBreadth, 6)
   * @return bestState: with move(bestHex) & bestValue
   */
  *lookaheadDeep(state0: State, stoneColor: StoneColor, nPlys = TP.maxPlys, breadth = TP.maxBreadth) {
    TP.log > 0 && console.groupCollapsed(`${stime(this,`.lookaheadDeep`)}-${this.logId(stoneColor, nPlys)}`)
    let sid0 = State.sid, ms0 = Date.now() // current state id

    // ASSERT: no voluntary yield, ~no lookahead:
    let moveAry = this.evalAndSortMoves(state0, stoneColor) // generate first approx of possible moves
    let bestState = this.skipState(state0); //bestState.bestValue -= 5      // to be updated ASAP
    try {
      for (let [hex, state1a] of moveAry) {                   // hex = state1a.move.hex
        if (this.roboStop) break
        if (--breadth < 0) break
        if (state1a.bestValue + .01 < Math.min(bestState.value, bestState.bestValue)) break
        if (nPlys - 1 >= 0) {
          // drill down: adding stones & influence, calc stats
          let evalGen = this.evalMoveInDepth(hex, stoneColor, nPlys - 1, state1a) // state1.bestValue=MIN(-state2.bestValue)
          let result: IteratorResult<void, State>
          while (result = evalGen.next(), !result.done) yield
          //ASSERT result.value === state1a, with bestValue possibly changed
        } else { 
          let state1 = this.evalMoveShallow(hex, stoneColor, 0, state1a) // nPlys-1 == 0
        }
        if (state1a.bestValue > bestState.bestValue) bestState = state1a // MAX
      }
      TP.log > 0 && console.groupEnd()
    } catch (err) {
      TP.log > 0 && console.groupEnd()
      throw err
    }
    
    if (TP.yield) {
      yield  // voluntary yield to allow event loop (& graphics paint)
    }

    if (TP.log > 0 || this.depth == this.moveNumber) {
      let dsid = State.sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      this.logMoveAry(moveAry, bestState)
      let bestValue = M.decimalRound(bestState.bestValue, 3), bestHex = bestState.move.hex, Aname = bestHex.Aname
      console.log(stime(this, `.lookaheadDeepX:`), nPlys, stoneColor, { Aname, bestHex, bestValue, sps, dsid, dms, bestState: bestState.copyOf(), sid: State.sid })
    }
    if (TP.log == 0) { // delete a bunch of States:
      // moveAry[I..J].moves: [hexI, state1-I] ... [hexJ, state1-J]
      // state1-I.moves: [hexK, state2-K] ... [hexL, state2-L] --> sstate1-I.moves = undefined
      let bestMoves = bestState.moves
      for (let [hex, state1] of moveAry) { state1.moves = undefined } // remove ALL the Map<Hex,State>
      // moveAry.splice(0, moveAry.length) // try release memory... [will be CG'd in any case ]
      // restore bestState.moves (pruned to remove un-evaluated states)
      if (bestMoves) for (let [hex, state] of bestMoves) { if (state.move.eval == 0) bestMoves.delete(hex)}
      bestState.moves = bestMoves
    }
    // returning a State tells allowEventLoop to terminate with: dispatchMove(bestState)
    return bestState
  }

  /** 
   * PlaceStone(hex, color) -> state1; lookahead recursively to find/estimate bestValue
   * @param hex play Stone to Hex and evaluate the State
   * @param stoneColor play Stone of this color -> evaluate from this players POV
   * @param nPlys evalState(move), then lookahead (nPlys, other) to obtain bestValue of move. [default: 0 --> no lookahead (unless fjCheck)]
   *              TODO: callers use evalMoveShallow when nPlys = 0, 1
   *              if nPlys = 0; generate/evalState(stoneColor, Move(hex, stoneColor))
   * @param bestState is not modified, only bestState.bestValue is consulted
   * @param state1 Move(hex, color) -> state1; set state1.move.eval & state1.bestValue (nPlys)
   * @return !!state1 ? (the better of bestState, state1) : newState(move(hex, stoneColor), stoneColor)
   */
  *evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number = 0, state1?: State) {
    if (nPlys > 0 || !state1) {
      let gamePlay = this.gamePlay, other = otherColor(stoneColor), win: StoneColor
      let move = this.placeStone(hex, stoneColor, `eMID`)     // new Move(hex, color) -> addStone -> ... state1
      gamePlay.undoRecs[gamePlay.undoRecs.length-1]['_emid'] = move.Aname
      // setup board for gStats.update(); as if having made a Move(hex, stoneColor)
      // captured already set by outer getCapture; w/undoRecs to [re-] addStone!
      if (!state1) {
        win = gamePlay.gStats.update()                      // calc stats & score for VP win
        state1 = this.evalState(stoneColor, move)           // set initial value (& bestValue)
        state1.fj = (move.captured.length == 0 && move.hex.isThreat(other))
        let board = gamePlay.setBoardAndRepCount(move)      // set/reduce repCount to actual value & set move.board 
        win = gamePlay.gStats.gameOver(board, win)          // check for resign, stalemate
        this.winState(state1, win)                          // adjust value if win/lose
      } else {
        win = this.stateWin(state1)
        state1.move = move                // <===  !!!  (with current captures, eval = 0 !)
        let board = gamePlay.setBoardAndRepCount(move)      // set/reduce repCount to actual value & set move.board
      }
      if (win === undefined) {
        // move into jeopardy [without capturing] is generally bad: (but *maybe* the stone is untakable...)
        // get a better assessment (& likely lower the ranking of this move)
        let fjCheck = state1.fj
        if (nPlys > 0 || fjCheck) {
          let nPlys2 = !fjCheck ? nPlys : Math.max(nPlys + (nPlys % 2), 2) // even number, >= 2
          // DFS-min/max: find opponent's best move against state1.move:
          let result: IteratorResult<any, State>
          let planGen = this.lookaheadDeep(state1, other, nPlys2)
          while (result = planGen.next(), !result.done) yield // deep & wide: propagate recursive yield
          let state2 = result.value
          state1.bestValue = Math.min(state1.bestValue, -state2.bestValue) // MIN
          state1.move.eval = state2.move.eval  // how deep state2 looked
          TP.log > 0 && console.log(stime(this, `.evalMoveInDepth: best=${M.decimalRound(state1.bestValue,2)}`), { move1: move.Aname, state1: state1.copyOf(), move2: state2.move.Aname, state2: state2.copyOf() })
        }
      }
      this.unplaceStone(move, true)
    }
    return state1
  }

  /** find bestState/bestValue from evaluating ~6 Moves from state0 
   * @param state0 look a few moves ahead from here
   * @param stoneColor next player [opposite(state0.move.color)]
   * @param nPlys 0, 1, 2
   * @param breadth min(TP.maxBreadth, 6) // ASSERT: state.fj == true
   */
  lookaheadShallow(state0: State, stoneColor: StoneColor, nPlys: number, breadth = Math.min(TP.maxBreadth, 6)): State {
    // Invoked when evalAndSortMoves->evalMoveShallow->fjCheck->lookAheadShallow(for 2 plys!)
    // Find possible moves, evalMoveShallow(move), sort them:
    let moveAry = this.evalAndSortMoves(state0, stoneColor), tn = this.depth, other = otherColor(stoneColor)
    TP.log > 0 && console.groupCollapsed(`${stime(this,`.lookaheadShallow`)}-${this.logId(stoneColor, nPlys)}`)

    let bestState = this.skipState(state0); bestState.bestValue -= 5 // white[2,2] -> black[1,1] to win... [bs.bv=-5]

    for (let [hex, state1a] of moveAry) {
      if (--breadth < 0) break        // 0-based++, so C-c can terminate loop
      if (state1a.bestValue + .01 < Math.min(bestState.value, bestState.bestValue)) break
      let state1 = this.evalMoveShallow(hex, stoneColor, nPlys - 1, state1a) // eval move an update state1/state1a
      // state1a.bestValue = state1.bestValue
      // state1a.move.eval = state1.move.eval
      if (state1a.bestValue > bestState.bestValue) bestState = state1a // MAX
    }
    TP.log > 0 && this.logMoveAry(moveAry, bestState)
    TP.log > 0 && console.groupEnd()
    return bestState
  }

  /** set state.value/bestValue; lookahead only if state.fj & !win 
   * @param hex play Stone to hex
   * @param stoneColor Stone being played
   * @parma nPlys lookahead [0,1,2] (for fjCheck)
   */
  evalMoveShallow(hex: Hex, stoneColor: StoneColor, nPlys: number, state1a?: State): State {
    let gamePlay = this.gamePlay, other = otherColor(stoneColor)
    let move = this.placeStone(hex, stoneColor, `eMS`)          // new Move(hex, color) -> addStone -> ... state1
    gamePlay.undoRecs[gamePlay.undoRecs.length-1]['_ems'] = move.Aname
    let win = gamePlay.gStats.update()                   // calc stats & score for VP win
    let state1 = this.evalState(stoneColor, move, state1a) // set initial value (& bestValue) <=== what we came for!
    state1.fj = (move.captured.length == 0 && move.hex.isThreat(other))
    let fjCheck = state1.fj && (this.depth < this.moveNumber + 8) // allow limited dogfight analysis
    let board = gamePlay.setBoardAndRepCount(move)       // set/reduce repCount to actual value & set move.board 
    win = gamePlay.gStats.gameOver(board, win)           // check for resign, stalemate
    let ind = state1.fj ? '-' : !move.captured ? '!' : move.captured.length > 0 ? `${move.captured.length}` : ' '
    this.winState(state1, win)                           // adjust value if win/lose
    TP.log > 0 && console.log(stime(this, `.evalMoveShallow: nPlys: ${nPlys}${win !== undefined ? ` --> win: ${TP.colorScheme[win]}` : ''}`),
      { move: move.Aname, fj: ind, bestValue: M.decimalRound(state1.bestValue, 2), state1: state1.copyOf() })

    if (win === undefined && (nPlys > 0 || fjCheck)) {
      let nPlys2 = !fjCheck ? nPlys : Math.max(nPlys + (nPlys % 2), 2) // even number, >= 2
      let state2 = this.lookaheadShallow(state1, other, nPlys2)
      state1.bestValue = Math.min(state1.bestValue, -state2.bestValue) // MIN
      state1.move.eval = state2.move.eval  // how deep state2 looked

      TP.log > 1 && console.log(stime(this, `.evalMoveShallow: nPlys: ${nPlys} after fjCheck`),
        { move: move.Aname, fj: state1.fj, bestValue: M.decimalRound(state1.bestValue, 2), state2: state2.copyOf() })
      TP.log > 0 && console.log(stime(this, `.evalMoveShallow: nPlys: ${nPlys} best= ${M.decimalRound(state1.bestValue, 2)}`),
        { move1: move.Aname, state1: state1.copyOf(), move2: state2.move.Aname, state2: state2.copyOf() })
    }
    this.unplaceStone(move, true)
    return state1
  }

  /** 
   * Initialize state0 with hex & bestHex = skipHex(-Infinity)
   * 
   * find some MOVES from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * 
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move, opposite(state.move.color))
   * @return with state0.moves sorted, descending from best initial value
   */
  evalAndSortMoves(state0: State, stoneColor: StoneColor): [Hex, State][] { // Generator<void, State, unknown>
    let gamePlay = this.gamePlay              // this.gamePlay: hexMap, history, allBoards, ...
    let moves = state0.moves, tn = this.depth
    if (!moves || moves.size == 0) {
      moves = state0.moves = new MOVES()
      //console.log(stime(this, `.evalAndSortMoves: state0 in:`), state0.copyOf())
      let hexGen = new HexGen(gamePlay, this.districtsToCheck).gen(), tn = this.depth
      let hexGenA = Array.from(hexGen)//.concat(this.gamePlay.hexMap.skipHex)
      TP.log > 0 && console.groupCollapsed(`${stime(this, `.evalAndSortMoves after ${state0.move.Aname}#${tn-1}:`)} -> ${TP.colorScheme[stoneColor]}#${tn} evalMoveShallow[${hexGenA.length}]:`)
      for (let hex of hexGenA) {
        let state = this.evalMoveShallow(hex, stoneColor, 0)
        moves.set(hex, state)
      }
      TP.log > 1 && console.log(stime(this, `.evalAndSortMoves: after ${state0.move?.Aname}#${tn-1}`), {moves: state0.moves, state0: state0.copyOf(), hexGenA})
      TP.log > 0 && console.groupEnd()
    } else {
      // log: 'using recycled moves'
      let entriesArray = (k: MOVES) => {
        let rv: [Hex, State][] = []
        for (let m of k) { rv.push(m) }
        return rv
      }
      TP.log > 1 && console.log(stime(this, `.evalAndSortMoves(${state0.move?.Aname}#${this.depth}): using recycled moves`),
        entriesArray(moves).map(([h, s]) => [s.move, s.move.eval, s.fj ? '-' : s.move.captured.length ? 'c' : s.move.eval > tn + 1 ? '+' : ' ',
        s.move.Aname, s.id, M.decimalRound(s.value, 3), M.decimalRound(s.bestValue, 3)]))
    }
    if (moves.size == 0) {
      TP.log > 1 && console.log(stime(this, `.evalAndSortMoves(${state0.move?.Aname}#${this.depth}): moveAry empty, state:`), state0.copyOf())
    }
    let moveAry = Array.from(moves.entries()).sort(([ha, sa], [hb, sb]) => sb.bestValue - sa.bestValue) // descending
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
  constructor (private gamePlay: GamePlay0, private districts: number[] = [0,1,2,3,4,5,6]) {}
  hexes = new Set<Hex>()
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move 'curPlayer' made
  color = otherColor(this.move0.stoneColor)

  ; *gen() {
    //yield* this.attackHex(this.move0.hex)
    if (this.move1) yield* this.adjacentHex(this.move1.hex)
    yield* this.alignHex(this.move0.hex)
    for (let d of this.districts) yield* this.allHexInDistrict(d)
  }

  *checkHex(hexIter: Iterable<Hex>) {
    for (let nHex of hexIter) {
      if (this.hexes.has(nHex)) continue
      this.hexes.add(nHex)
      // discarding captured[] !! we don't have a Move to stuff then into...
      if (!this.gamePlay.isLegalMove(nHex, this.color)) continue
      yield nHex                // new move && not suicide
    }
  }

  //this.gamePlay.getCaptures(nHex, color)
  allHexInDistrict(d: number) {
    return this.checkHex(this.gamePlay.hexMap.district[d])
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