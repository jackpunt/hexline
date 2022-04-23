import { M, Obj, S, stime, Undo } from "@thegraid/createjs-lib";
import { GamePlay0, GamePlayC, Move, Mover, Player } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { HexEvent } from "./hex-event";
import { allowEventLoop, H, YieldR, yieldR } from "./hex-intfs";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColorRecord, TP } from "./table-params";

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
 function newState(move: Move, color: StoneColor, value: number, moves?: MOVES): State {
  return { move, color, value, id: ++sid, moves, bestValue: value }
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
export class Planner {
  gamePlay: GamePlayC
  weightVecs: Record<StoneColor, number[]>

  constructor(gamePlay: GamePlay0) {
    this.gamePlay = new GamePlayC(gamePlay)  // downgrade to GamePlayC
    // compatible with statVector in stats.ts
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    let dStoneM = new Array<number>(nDist).fill(1, 0, nDist), wv0, wv1
    // s0 = inControl, dMax, district0, nStones, nInf
    let s0M0 = 1.3, dMaxM0 = 1, dist0M0 = 1, nStoneM0 = 1.1, nInfM0 = .3, nThreatM0 = .2, nAttackM0 = .5, nAdjM0 = .1
    wv0 = dStoneM.concat([s0M0, dMaxM0, dist0M0, nStoneM0, nInfM0, nThreatM0, nAttackM0, nAdjM0])

    let s0M1 = 1.4, dMaxM1 = .9, dist0M1 = .8, nStoneM1 = 1.2, nInfM1 = .25, nThreatM1 = .25, nAttackM1 = .6, nAdjM1 = .2
    wv1 = dStoneM.concat([s0M1, dMaxM1, dist0M1, nStoneM1, nInfM1, nThreatM1, nAttackM1, nAdjM1])
    this.weightVecs = stoneColorRecord(wv0, wv1)
  }

  skipState(color: StoneColor, v0 = Number.NEGATIVE_INFINITY): State {
    let hex = this.gamePlay.hexMap.skipHex, move = new Move(hex, color) 
    return newState(move, color, v0)
  }
  resignState(color: StoneColor, v0 = Number.NEGATIVE_INFINITY): State {
    let hex = this.gamePlay.hexMap.resignHex, move = new Move(hex, color) 
    return newState(move, color, v0)
  }

  /** 
   * Make a State object with simple value of current board.
   * @param color evaluate from the POV of the given color
   * @param move  for documentation/debugging: move that brought us to this state
   * @param win   color of player for whom 'move' is a winning move
   */
  evalState(color: StoneColor, move = this.gamePlay.history[0], win?: StoneColor): State {
    let weightVec = this.weightVecs[color]
    if (win) {
      let value = (win == color) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      return newState(move, color, value)
    }
    let other = otherColor(color)
    let s0 = this.gamePlay.gStats.getSummaryStat(color, weightVec)
    let s1 = this.gamePlay.gStats.getSummaryStat(other, weightVec)
    let value = s0 - s1 // best move for color will maximize value
    let hex = undefined; //this.gamePlay.hexMap.skipHex
    //console.log(stime(this, `.evalState:`), { move, color, value, bestValue: value, hex, bestHex: hex })
    
    return newState(move, color, value, hex ) // moves is undefined
  }

  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table?: Table) {
    let gamePlay = this.gamePlay
    if (!gamePlay.gStats) gamePlay.gStats = gamePlay.original.gStats.toGameStats()
    //console.log(stime(this, `.makeMove: stone=`), stone)
    gamePlay.gStats.update()
    let state0 = this.evalState(stone.color), sid0 = sid, tn = gamePlay.original.turnNumber

    let dispatchMove = (state: State) => {
      let hex = state.move.hex
      console.log(stime(this, `.makeMove: MOVE#${tn} = ${state.move.Aname} state=`), copyOf(state))
      if (table) {
        // robo-player uses gamePlayC, so doesn't maintain Stone.stoneId, fix them here:
        table.gamePlay.history.forEach((moveR, ndx, history) => {
          let sid = ndx + 1, move = history[history.length - sid] // label from beginning of game
          if (move.hex.stoneColor) (move.hex as Hex2).setStoneId(sid)
        })
        table.hexMap.showMark(hex)
        table.dispatchEvent(new HexEvent(S.add, hex, stone)) //
      }
    }
    let firstMove = () => {
      let lastDist = TP.ftHexes(TP.mHexes) - 1
      let hex = gamePlay.hexMap.district[lastDist][0]
      dispatchMove(newState(new Move(hex, stone.color), stone.color, 0))
    }
    if (gamePlay.history.length < 1) return firstMove()
    allowEventLoop(this.lookahead(state0, stone.color, 0), (state: State) => dispatchMove(state))
  }
  /** 
   * lookahead from current State; with its potential MOVES
   * try someGoodMoves, update State values looking maxPlys deep
   * otherColor [state0.color] has just moved: gamePlay in curState
   * find some good moves, play N of them, setting value(curState) 
   * return a State with bestValue, bestHex
   * @param state0 other player has left board in state0
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return the State representing the bestHex to be played
   */
  *lookahead(state0: State, stoneColor: StoneColor, nPlys: number, done?: (state: State) => void) {
    let tn = this.gamePlay.history.length
    console.groupCollapsed(`${stime(this,`.lookahead`)}-${nPlys}/${TP.maxPlys} after ${otherColor(stoneColor)}#${tn}->${this.gamePlay.history[0].hex.Aname} ${stoneColor}#${tn+1}->`)
    let sid0 = sid, ms0 = Date.now() // current state id
    // ASSERT: no voluntary yield in this case
    let result = this.evalSomeMoves(state0, stoneColor).next()
    let moveAry = result.done? result.value : undefined // generate first approx of possible moves
    // console.log(stime(this, `.evalSomeMoves: moveAry=`), moveAry.length, 
    //             moveAry.map(([h,s]) => [h.Aname, M.decimalRound(s.value,3), M.decimalRound(s.bestValue,3)]))
    // console.log(stime(this, `.loookahead: initial state0:`), state0.move.Aname, state0.bestHex?.Aname, copyOf(state0))
    // console.log(stime(this, `.loookahead: initial moves:`), state0.move.Aname, state0.bestHex?.Aname, 
    //             Array.from(state0.moves.entries()).map(([hex,state]) => {return {hex, state: copyOf(state)}}))
    // if no legal moves, we can 'skip' for -Infinity, keeping the same state and value
    // state0.value could be arbitrarily high... (and wrong)
    let breadth = 0, bestState = this.skipState(stoneColor) // to be updated ASAP
    for (let [hex, state1a] of moveAry) {
      if (++breadth > TP.maxBreadth) break            // 0-based++, so C-c can terminate loop
      if (state1a.value < bestState.bestValue) break // lookahead would at best lower state value *????*
      let evalGen = this.evalMoveInDepth(hex, stoneColor, nPlys+1, bestState, state1a)
      let result: IteratorResult<void, State>
      while (result = evalGen.next(), !result.done) yield
      bestState = result.value
    }
    console.groupEnd()
    if (TP.yield) yield  // voluntary yield to allow event loop (& graphics paint)
    let dsid = sid - sid0, dms = Date.now() - ms0, sps = M.decimalRound(1000*dsid/dms, 0)
    console.log(stime(this, `.lookahead: evalAry =`),
      moveAry.map(([h, s]) => [s.move.Aname, M.decimalRound(s.value, 3), M.decimalRound(s.bestValue, 3),
        (h == bestState.move.hex) ? '*': '']))
    let bestValue = M.decimalRound(bestState.bestValue, 3), bestHex = bestState.move.hex, Aname = bestHex.Aname
    console.log(stime(this, `.lookahead:`), nPlys, stoneColor, { Aname, bestHex, bestValue, sps, dsid, dms, bestState: copyOf(bestState) })
    done && done(bestState)
    return bestState // or resign? or skip?
  }

  /** 
   * EvaluateNextState: recurse with lookahead after playing hex.
   * @param hex play stone to Hex and evaluate the board
   * @param stoneColor play Stone of this color -> evaluate from this players POV
   * @param nPlys if nPlys < maxPlys then lookahead with other Player.
   * @param bestState update with bestValue & bestHex if playing to hex is better
   * @param state1 if nPlys < maxPlys then state1 must be supplied: the curent state (from evalSomeMoves)
   * @return state reached by playing hex (generally: state1)
   */
  *evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number, bestState: State, state1?: State) {
    let move: Move, myWin: StoneColor = undefined, planner = this, gamePlay = this.gamePlay
    // if (!state1) nPlys = TP.maxPlys
    /** 
     * with stone on hex: compute move, board, gStats
     * then remove stone (and getCaptures will undo the rest)
     * 
     * plugin func for gamePlay.getCaptures(hex, color) 
     */
    function* evalAfterMove(): YieldR<object> {
      //const hex = gamePlay.curHex      // same as outer hex!?
      // setup board for gStats.update(); as if having made a Move(hex, stoneColor)
      // captured already set by outer getCapture; w/undoRecs to [re-] addStone!
      move = new Move(hex, stoneColor, gamePlay.captured) // presumably achieve 'state1'
      gamePlay.history.unshift(move)                      // to compute Board & board.repCount
      gamePlay.setBoardAndRepCount(move)                  // set/reduce repCount to actual value 
      let win = gamePlay.gStats.update()                  // use GameStats: do NOT showRepCount(), showWin()
      if (!win && nPlys < TP.maxPlys) {
        // ASIF: nextPlayer:
        // unmarkOldCaptures ? [uses history[0].move.captured] -> inject move.captured
        let other = otherColor(stoneColor)
        // Depth-First search: find moves from state1 to bestHex
        let result: IteratorResult<any, State>
        let planGen = planner.lookahead(state1, other, nPlys, (state2: State) => {
          console.log(stime(this, `.evalAfterMove: lookahead`), { move1: move.Aname, state1: copyOf(state1), move2: state2.move.Aname, state2: copyOf(state2) })
          if (-state2.bestValue < state1.bestValue) {
            state1.bestValue = -state2.bestValue // MIN
            //state1.bestHex = hex
          }
        })
        while (result = planGen.next(), !result.done) yield // propagate recursive yield
      }
      gamePlay.history.shift()
      myWin = win         // record 'win' at top of stack. (overwriting other wins...)
      return { moveName: move.Aname, bv: state1?.bestValue }
      // getCaptures will: undoInfluence.close().pop(), undoRecs.close().pop(); this.captured === move.captures
    }

    let evalAfterGen = evalAfterMove()
    let result: IteratorResult<any, Hex[]>, capGen = this.getCaptures(hex, stoneColor, evalAfterGen)
    while (result = capGen.next(), !result.done) yield

    let stateR = state1 || this.evalState(stoneColor, move, myWin) // zero order value after playing hex on hexMap
    if (bestState.bestValue < stateR.bestValue) {
      bestState = stateR        // stateR.move.hex == bestHex!
    }
    return bestState // return for evalSomeMoves: moves.set(hex, stateR); later stateR will be supplied as state1
  }
  /** place color on hex, find captures & suicide; run genR; undo it all.
   * leaving gamePlay in original state.
   */
  *getCaptures(hex: Hex, color: StoneColor, genR?: YieldR<object>) {
    let gamePlay = this.gamePlay
    let pcaps = gamePlay.captured; gamePlay.captured = []
    let undoInf = gamePlay.undoInfluence; gamePlay.undoStack.push(gamePlay.undoRecs)
    gamePlay.undoInfluence = new Undo().enableUndo()
    gamePlay.undoRecs = new Undo().enableUndo()
    gamePlay.curHex = hex                // immune from capture; later check suicide
    gamePlay.addStone(hex, color)        // may invoke captureStone() -> undoRec(Stone & capMark)
    // capture may *remove* some inf & InfMarks!
    let suicide = hex.isAttack(otherColor(color)), rv = suicide ? undefined : gamePlay.captured
    if (genR) {
      let result: IteratorResult<void, object>
      while (result = genR.next(), !result.done) yield
      let { bv, moveName } = (result.value as { bv: number, moveName: string })
      if (!!bv) console.log(stime(this, `.getCaptures: move =`), moveName, bv, 'caps=', rv ? rv : 'suicide')
    }
    gamePlay.undoInfluence.closeUndo().pop()
    gamePlay.undoRecs.closeUndo().pop()    // like undoStones(); SHOULD replace captured Stones/Colors
    gamePlay.undoRecs = gamePlay.undoStack.pop(); gamePlay.undoInfluence = undoInf
    gamePlay.undoCapMarks(gamePlay.captured); // undoCapture
    gamePlay.captured = pcaps
    return rv
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
  *evalSomeMoves(state0: State, stoneColor: StoneColor) { //: [Hex, State][]
    let gamePlay = this.gamePlay              // this.gamePlay: hexMap, history, allBoards, ...
    let moves = state0.moves = new Map<Hex,State>()
    // In case there are NO LEGAL MOVES, set skipHex:
    let bestState = this.skipState(stoneColor, state0.value)
    //console.log(stime(this, `.evalSomeMoves: state0 in:`), copyof(state0))
    let hexGen = new HexGen(gamePlay).gen(), result: IteratorResult<Hex, void>
    // Find/Gen the legal moves *before* evalMoveInDepth changes gStats/pStats:
    let hexGenA = Array.from(hexGen)
    for (let hex of hexGenA) {
      let evalGen = this.evalMoveInDepth(hex, stoneColor, TP.maxPlys, bestState, undefined)
      let result: IteratorResult<void, State>
      while (result = evalGen.next(), !result.done) yield
      let state = result.value
      state0.moves.set(hex, state)
    }
    //console.log(stime(this, `.evalSomeMoves: state0 out:`), state0.bestHex?.Aname, copyof(state0))
    let moveAry = Array.from(moves.entries()).sort(([ha,sa], [hb,sb]) => sb.value - sa.value) // descending
    return moveAry
  }
}
/**
 * 1. evalSomeMoves as generator, so can yield the initial value; then sort and proceed with the good ones.
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
  constructor (private gamePlay: GamePlay0) {}
  hexes = new Set<Hex>()
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move 'curPlayer' made
  color = otherColor(this.move0.stoneColor)

  ; *gen() {
    //yield* this.attackHex(this.move0.hex)
    if (this.move1) yield* this.adjacentHex(this.move1.hex)
    yield* this.alignHex(this.move0.hex)
    for (let d  of [0, 1, 2, 3, 4, 5, 6]) yield* this.allHexInDistrict(d)
  }

  *checkHex(hexary: Iterable<Hex>, 
    pred?: (hex: Hex, color: StoneColor) => boolean) {
    for (let nHex of hexary) {
      if (this.hexes.has(nHex)) continue
      if (!pred) this.hexes.add(nHex)
      if (!this.gamePlay.isLegalMove(nHex, this.color, pred)) continue
      this.hexes.add(nHex)
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
  /** Hexes which attack the indicated Hex, but really: just use alignHex */
  attackHex(hex: Hex) {
    let pred = (nhex: Hex, color: StoneColor) => {
      let caps = this.gamePlay.getCaptures(nhex, color)
      return caps?.includes(hex) // true if (not suicide and) hex was captured
    } // by the time we check for capture, we already have the base-value; what point to filtering out this hex?
    let genHex = this.radialHex(hex)
    return this.checkHex(genHex, pred)
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