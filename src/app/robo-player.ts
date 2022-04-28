import { M, Obj, S, stime, Undo } from "@thegraid/createjs-lib";
import { GamePlay0, GamePlayC, Move, Mover, Player } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { HexEvent } from "./hex-event";
import { allowEventLoop, H, } from "./hex-intfs";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColorRecord, stoneColorRecordF, TP } from "./table-params";

type MOVES = Map<Hex, State> // move.hex, move.stone, move.board, move.board.captured
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
type State = { move: Move, color: StoneColor, value: number, id: number, moves?: MOVES, bestValue?: number } 
var sid = 0  // serial number to help analyze state migration
 function newState(move: Move, color: StoneColor, value: number): State {
  return { move, color, value, id: ++sid, bestValue: value }
}
/** utility for logging an non-mutating copy for State */
 function copyOf(s0: State): State {
   let s1 = Obj.objectFromEntries(s0)
   s1.value && (s1.value = M.decimalRound(s1.value, 3))
   s1.bestValue && (s1.bestValue = M.decimalRound(s1.bestValue, 3))
   s1['copyof'] = s0
   return s1
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
  gamePlay: GamePlayC
  weightVecs: Record<StoneColor, number[]>
  running = false
  districtsToCheck = TP.nHexes > 1 ? [0, 1, 2, 3, 4, 5, 6] 
    : (() => { let a = Array<number>(TP.ftHexes(TP.mHexes)).fill(0); a.forEach((v, ndx) => a[ndx] = ndx); return a })()
  prevState: State // previous state

  constructor(gamePlay: GamePlay0) {
    this.gamePlay = new GamePlayC(gamePlay)  // downgrade to GamePlayC
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
    let endState = (hex: Hex, color: StoneColor) => newState(new Move(hex, color), color, Number.NEGATIVE_INFINITY)
    this.skipStateRec = stoneColorRecordF(sc => endState(this.gamePlay.hexMap.skipHex, sc))
    this.resignStateRec = stoneColorRecordF(sc => endState(this.gamePlay.hexMap.resignHex, sc))
  }
  skipStateRec: Record<StoneColor, State>
  skipState(color: StoneColor): State { 
    let state = this.skipStateRec[color]
    state.value = state.bestValue = Number.NEGATIVE_INFINITY
    return state
  }
  resignStateRec: Record<StoneColor, State>
  resignState(color: StoneColor): State {
    let state = this.resignStateRec[color]
    state.value = state.bestValue = Number.NEGATIVE_INFINITY
    return state
  }


  /** 
   * Make a State object with simple value of current board.
   * @param color evaluate from the POV of the given color
   * @param move  for documentation/debugging: move that brought us to this state
   */
  evalState(color: StoneColor, move = this.gamePlay.history[0]): State {
    let weightVec = this.weightVecs[color]
    let other = otherColor(color)
    let s0 = this.gamePlay.gStats.getSummaryStat(color, weightVec)
    let s1 = this.gamePlay.gStats.getSummaryStat(other, weightVec)
    let value = s0 - s1 // best move for color will maximize value
    //console.log(stime(this, `.evalState:`), { move, color, value, bestValue: value, hex, bestHex: hex })
    
    return newState(move, color, value ) // moves is undefined
  }
  winState(state: State, win: StoneColor): StoneColor {
    if (win !== undefined) state.bestValue = (win === state.move.stoneColor) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    return win
  }
  stateWin(state: State) {
    if (state.bestValue == Number.POSITIVE_INFINITY) return state.move.stoneColor
    if (state.bestValue == Number.NEGATIVE_INFINITY) return otherColor(state.move.stoneColor)
    return undefined
  }

  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table?: Table) {
    this.running = true // TODO: maybe need a catch?
    let gamePlay = this.gamePlay
    if (!gamePlay.gStats) gamePlay.gStats = gamePlay.original.gStats.toGameStats()
    //console.log(stime(this, `.makeMove: stone=`), stone)
    gamePlay.gStats.update()

    let sid0 = sid, ms0 = Date.now()-1, tn = gamePlay.original.turnNumber
    let dispatchMove = (state: State) => {
      let hex = state.move.hex
      let dsid = sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      console.log(stime(this, `.makeMove: MOVE#${tn} = ${state.move.Aname}`), `state=`, copyOf(state), {sps, dms, dsid})
      if (table) {
        // robo-player uses gamePlayC, so doesn't maintain Stone.stoneId, fix them here:
        table.gamePlay.history.forEach((moveR, ndx, history) => {
          let stoneId = ndx + 1, move = history[history.length - stoneId] // label from beginning of game
          if (move.hex.stoneColor) (move.hex as Hex2).setStoneId(stoneId)
        })
        this.prevState = state
        this.running = false
        table.hexMap.showMark(hex)
        table.dispatchEvent(new HexEvent(S.add, hex, stone)) //
      }
    }
    let firstMove = () => {
      sid = sid0 = 0
      let lastDist = TP.ftHexes(TP.mHexes) - 1
      let hex = gamePlay.hexMap.district[lastDist][0]
      dispatchMove(newState(new Move(hex, stone.color), stone.color, 0))
    }
    if (gamePlay.history.length < 1) return firstMove()
    // try get previously evaluated State & MOVES:
    let move0 = gamePlay.history[0], hex0 = move0.hex    // other Player's last move
    // cheat: see if other Planner has State & MOVES:
    let op = this.gamePlay.original.otherPlayer()
    let state0 = op.planner?.prevState// this.gamePlay.otherPlayer().planner?.prevState
    // righteous: from our own previous analysis:
    if (!state0) state0 = this.prevState?.moves?.get(hex0) || this.evalState(stone.color)
    allowEventLoop(this.lookahead(state0, stone.color, 0), (state: State) => dispatchMove(state))
  }
  /** 
   * lookahead from current State; with its potential MOVES
   * try someGoodMoves, update State values looking maxPlys deep
   * otherColor [state0.color] has just moved: gamePlay in curState
   * find some good moves, play N of them, setting value(curState) 
   * return a State with bestValue, bestHex
   * @param state0 other player has left board in state0 (which we may have foreseen & evaluated)
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @param nPlys typically = 0; counts up to TP.maxPlys; for free-jeopardy it map be bumped higher
   * @param b0 typically = 0; counts up to TP.maxBreadth; for free-jeopardy it map be bumped higher
   * @param done callback function: (bestState: State) => void
   * @return bestState: with move(bestHex) & bestValue [not used by anyone...]
   */
  *lookahead(state0: State, stoneColor: StoneColor, nPlys: number, b0 = 0, done?: (bestState: State) => void) {
    let tn = this.gamePlay.history.length
    console.groupCollapsed(`${stime(this,`.lookahead`)}-${nPlys}/${TP.maxPlys} after ${otherColor(stoneColor)}#${tn}->${this.gamePlay.history[0].hex.Aname} ${stoneColor}#${tn+1}->`)
    let sid0 = sid, ms0 = Date.now() // current state id
    // ASSERT: no lookahead & no voluntary yield:
    let moveAry = this.evalAndSortMoves(state0, stoneColor, nPlys) // generate first approx of possible moves
    let breadth = b0, bestState = this.skipState(stoneColor) // to be updated ASAP
    try {
      for (let [hex, state1a] of moveAry) {                   // hex = state1a.move.hex
        if (++breadth > TP.maxBreadth) break                  // 0-based++, so C-c can terminate loop
        if (state1a.bestValue + .01 < Math.min(bestState.value, bestState.bestValue)) break
        // drill down: adding stones & influence, calc stats
        let evalGen = this.evalMoveInDepth(hex, stoneColor, nPlys + 1, bestState, state1a)
        let result: IteratorResult<void, State>
        while (result = evalGen.next(), !result.done) yield
        bestState = result.value
      }
      console.groupEnd()
    } catch (err) {
      console.groupEnd()
      throw err
    }
    if (TP.yield) yield  // voluntary yield to allow event loop (& graphics paint)
    if (TP.log) {
      let dsid = sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000 * dsid / dms, 0)
      console.log(stime(this, `.lookahead: evalAry =`),
        moveAry.map(([h, s]) => [s.move, s.move['eval'] || '', s.move.Aname, s.id, M.decimalRound(s.value, 3), M.decimalRound(s.bestValue, 3),
        (h == bestState.move.hex) ? '*' : '']))
      let bestValue = M.decimalRound(bestState.bestValue, 3), bestHex = bestState.move.hex, Aname = bestHex.Aname
      console.log(stime(this, `.lookahead:`), nPlys, stoneColor, { Aname, bestHex, bestValue, sps, dsid, dms, bestState: copyOf(bestState), sid })
    }
    done && done(bestState)
    return bestState // or resign? or skip?
  }

  /** 
   * EvaluateNextState: recurse with lookahead after playing hex.
   * @param hex play stone to Hex and evaluate the board
   * @param stoneColor play Stone of this color -> evaluate from this players POV
   * @param nPlys if nPlys < maxPlys then lookahead with other Player.
   * @param bestState is not modified, only bestState.bestValue is consulted
   * @param state1 Move(hex, color) -> state1; set state1.move['eval'] & state1.bestValue (nPlys)
   * @return !!state1  ? (the better of bestState, state1) : newState(move(hex, stoneColor), stoneColor)
   */
  *evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number = TP.maxPlys, bestState?: State, state1?: State) {
    if (nPlys < TP.maxPlys || !state1) {
      let planner = this, gamePlay = this.gamePlay, move: Move, other = otherColor(stoneColor)
      this.placeStone(hex, stoneColor) // new Move(hex, color) -> addStone
      move = gamePlay.history[0]
      // setup board for gStats.update(); as if having made a Move(hex, stoneColor)
      // captured already set by outer getCapture; w/undoRecs to [re-] addStone!
      let win: StoneColor
      //move = gamePlay.history[0]                           // getCaptures pushed a move(hex, stoneColor)
      if (state1) {
        win = planner.stateWin(state1)
        state1.move = move                // <===  !!!  (with current captures)
      } else {
        win = gamePlay.gStats.update()                      // calc stats & score for VP win
        state1 = planner.evalState(stoneColor, move)        // set initial value (& bestValue)

        let board = gamePlay.setBoardAndRepCount(move)      // set/reduce repCount to actual value 
        win = gamePlay.gStats.gameOver(board, win)          // check for resign, stalemate
        planner.winState(state1, win)                       // adjust value if win/lose
      }
      if (win !== undefined) {
        // move into jeopardy [without capturing] is generally bad: (but *maybe* the stone is untakable...)
        // get a better assessment (& likely lower the ranking of this move)
        let fj = (move.captured.length == 0 && Object.values(move.hex.inf[other]).find(inf => inf > 0)) && (nPlys < TP.maxPlys + 2)
        if (nPlys < TP.maxPlys ||
          (fj && (console.log(stime(this, `.fj: look-deeper`), nPlys, move.Aname, state1.bestValue), true))) { // extend depth if state1.fj
          move['eval'] = fj ? '-' : '+'
          // Depth-First search: find move from state1 to bestHex
          let result: IteratorResult<any, State>
          let planGen = planner.lookahead(state1, other, nPlys + (fj ? 1 : 0), (fj ? Math.max(0, TP.maxBreadth - 6) : 0),
            (state2: State) => {
              console.log(stime(this, `.evalAfterMove: lookahead`), { move1: move.Aname, state1: copyOf(state1), move2: state2.move.Aname, state2: copyOf(state2) })
              state1.bestValue = -state2.bestValue // MIN
            })
          while (result = planGen.next(), !result.done) yield // propagate recursive yield
        }
      }
      // let bv = state1?.bestValue
      // console.log(stime(this, `.evalMoveInDepth: move =`), move.Aname, M.decimalRound(bv, 3), 'caps=', rv ? rv : 'suicide')
      this.unplaceStone(move)
    }

    if (!bestState) return state1
    return (state1.bestValue > bestState.bestValue) ? state1 : bestState // for lookahead: best of states so far
  }
  readonly undoStack: Undo[] = []  // stack of Undo array-objects
  /** make Move, unshift, addStone -> captured  */
  placeStone(hex: Hex, color: StoneColor) {
    let gamePlay = this.gamePlay, move0 = new Move(hex, color, [])
    this.undoStack.push(gamePlay.undoRecs) // until we have immutable/write-on-modify HexMap...
    gamePlay.history.unshift(move0)
    gamePlay.undoRecs = new Undo().enableUndo()
    gamePlay.addStone(hex, color)        // may invoke captureStone() -> undoRec(Stone & capMark)
  }
  unplaceStone(move: Move) {
    let gamePlay = this.gamePlay
    gamePlay.undoRecs.closeUndo().pop()    // like undoStones(); SHOULD replace captured Stones/Colors
    gamePlay.history.shift()
    gamePlay.undoCapMarks(move.captured); // undoCapture
    gamePlay.undoRecs = this.undoStack.pop(); 
  }

  /** 
   * Initialize state0 with hex & bestHex = skipHex(-Infinity)
   * 
   * find some MOVES from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * 
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return with state0.moves sorted, descending from best initial value
   */
  evalAndSortMoves(state0: State, stoneColor: StoneColor, nPlys: number): [Hex, State][] { // Generator<void, State, unknown>
    let gamePlay = this.gamePlay              // this.gamePlay: hexMap, history, allBoards, ...
    let moves = state0.moves
    if (!moves) {
      moves = state0.moves = new Map<Hex, State>()
      //console.log(stime(this, `.evalAndSortMoves: state0 in:`), copyof(state0))
      let hexGen = new HexGen(gamePlay, this.districtsToCheck).gen(), result: IteratorResult<Hex, void>
      // Find/Gen the legal moves *before* evalMoveInDepth changes gStats/pStats:
      let hexGenA = Array.from(hexGen)
      console.groupCollapsed(`${stime(this, `.evalAndSortMoves after:`)} ${state0.move.Aname} -> ${hexGenA.length} getCaptures:`)
      for (let hex of hexGenA) {
        let evalGen = this.evalMoveInDepth(hex, stoneColor, Math.max(nPlys, TP.maxPlys))
        let result: IteratorResult<void, State>
        while (result = evalGen.next(), !result.done) { };// yield // ASSERT: evalMove does not yield in this case.
        let state = result.value
        moves.set(hex, state)
      }
      console.groupEnd()
    }
    //console.log(stime(this, `.evalAndSortMoves: state0 out:`), state0.bestHex?.Aname, copyof(state0))
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