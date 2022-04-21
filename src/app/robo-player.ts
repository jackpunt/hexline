import { M, Obj, S, stime, Undo } from "@thegraid/createjs-lib";
import { GamePlay0, Move, Mover, Player } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { HexEvent } from "./hex-event";
import { allowEventLoop, H, YieldR, yieldR } from "./hex-intfs";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColorRecord, TP } from "./table-params";

type MOVES = Map<Hex, State> // move.hex, move.stone, move.board, move.board.captured
/** 
 * move is how we got here.. (move0) could be backlink? index into gamePlay.history?
 * value is original estimate of value; 
 * bestValue is Max value over the evaluated MOVES; bestHex being the move that provides bestValue.
 */
type State = { move: Move, hex?: Hex, color: StoneColor, value: number, id: number, moves?: MOVES, bestHex?: Hex, bestValue?: number } 
var sid = 0  // serial number to help analyze state migration
 function newState(move: Move, color: StoneColor, value: number, hex?: Hex, moves?: MOVES): State {
  return { move, color, value, id: ++sid, moves, hex, bestHex: hex, bestValue: value }
}
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
  // First to moves are book-lookup: place First/Other stone (near edge); place Second stone (near center)
  // then First/Other player responds: place near Second stone, to block access to center
  // do not place in jeopardy unless: (a) is capturing OR (b) no immediate attack [check long-range attacks!]
  // ... for each dir from place: see if legal play by Other will capture hex.
  //
  // for each hex along line from Other's (ascending distance from center-line) 
  // --> if hex is playable add to list; 
  // sort list by distance from other stones?
  //
  // other generator: for each of OP's stones in jeopardy, see if you can capture.
  //
  // this approach good from 'early game' 
  // when players have thickness, then need more 'attack from the rear' (dist from center-line gets big)

  // metrics (see stats) : { stones, influence, threats, attacks }
  // 
  // evaluate dogfights...
  //

  stonesInJeopardy(color: StoneColor): Hex[] { return []} // stats.nThreats
  stonesThatKill(hex: Hex): Hex[] { return []}
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
  gamePlay: GamePlay0
  weightVecs: Record<StoneColor, number[]>

  constructor(gamePlay: GamePlay0) {
    this.gamePlay = new GamePlay0(gamePlay)  // downgrade to GamePlay0
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

  skipState(color: StoneColor, v0 = Number.NEGATIVE_INFINITY): State {
    let hex = this.gamePlay.hexMap.skipHex, move = new Move(hex, color) 
    return newState(move, color, v0, hex)
  }
  resignState(color: StoneColor, v0 = Number.NEGATIVE_INFINITY): State {
    let hex = this.gamePlay.hexMap.resignHex, move = new Move(hex, color) 
    return newState(move, color, v0, hex)
  }
  restoreStones() {
    // hack to re-link any orphaned Stones to their hexes:
    let hex = this.gamePlay.curHex     // or hexMap.districts[0][0] if you must...
    if (!(hex instanceof Hex2)) return // obsolete when not re-using graphical HexMap.
    let hexMap = this.gamePlay.hexMap, children = hexMap.stoneCont.children
    if (hexMap.allStones.length == children.length-1) return // -1 for RepCountText
    hexMap.forEachHex((hex: Hex2) => {
      if (!hex.stoneColor || !!hex.stone) return
      let tname = `[${hex.row},${hex.col}]`
      let stone = children.find((stone: Stone) => stone[S.Aname] == tname) as Stone
      hex.stone = stone
    })
  }
  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table?: Table) {
    let gamePlay = this.gamePlay, tn0 = gamePlay.turnNumber, tn = gamePlay.history.length+1
    if (!gamePlay.gStats) gamePlay.gStats = gamePlay.original.gStats.toGameStats()
    //console.log(stime(this, `.makeMove: stone=`), stone)
    gamePlay.gStats.update()
    let state0 = this.evalState(stone.color), sid0 = sid

    let dispatchMove = (state: State) => {
      let hex = state.bestHex
      console.log(stime(this, `.makeMove: MOVE#${tn} = ${state.color} ${state.hex.Aname} state=`), copyOf(state),
        `nStates=${sid-sid0}`)
      if (table) {
        table.hexMap.showMark(hex)
        table.dispatchEvent(new HexEvent(S.add, hex, stone)) //
      }
    }
    let firstMove = () => {
      let lastDist = TP.ftHexes(TP.mHexes)-1, hex: Hex
      //if (TP.nHexes == 1) {
        hex = gamePlay.hexMap.district[lastDist][0]
        dispatchMove(newState(new Move(hex, stone.color), stone.color, 0, hex))
       //}
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
    console.groupCollapsed(`${stime(this,`.lookahead`)}-${nPlys} after ${otherColor(stoneColor)}#${this.gamePlay.history.length}->${this.gamePlay.history[0].hex.Aname} ${stoneColor}->`)
    let moveAry = this.evalSomeMoves(state0, stoneColor).next().value // generate first approx of possible moves
    // console.log(stime(this, `.evalSomeMoves: moveAry=`), moveAry.length, 
    //             moveAry.map(([h,s]) => [h.Aname, M.decimalRound(s.value,3), M.decimalRound(s.bestValue,3)]))
    // console.log(stime(this, `.loookahead: initial state0:`), state0.move.Aname, state0.bestHex?.Aname, copyOf(state0))
    // console.log(stime(this, `.loookahead: initial moves:`), state0.move.Aname, state0.bestHex?.Aname, 
    //             Array.from(state0.moves.entries()).map(([hex,state]) => {return {hex, state: copyOf(state)}}))
    // if no legal moves, we can 'skip' for -Infinity, keeping the same state and value
    // state0.value could be arbitrarily high... (and wrong)
    let breadth = 0, bestState = this.skipState(stoneColor)
    for (let [hex, state1a] of moveAry) {
      if (++breadth > TP.maxBreadth) break
      if (state1a.value < bestState.bestValue ) break // lookahead would at best lower state value
      let evalGen = this.evalMoveInDepth(hex, stoneColor, nPlys+1, bestState, state1a)
      let result: IteratorResult<void, State>
      while (result = evalGen.next(), !result.done) yield
    }
    console.log(stime(this, `.lookahead: evalAry =`),
      moveAry.map(([h, s]) => [h.Aname, M.decimalRound(s.value, 3), M.decimalRound(s.bestValue, 3), s===bestState? '*': undefined]))
    console.groupEnd()
    let bestHex = bestState.bestHex, bestValue = M.decimalRound(bestState.bestValue, 3), Aname = bestHex.Aname
    console.log(stime(this, `.lookahead:`), nPlys, stoneColor, { Aname, bestHex, bestValue, bestState: copyOf(bestState) })
    done && done(bestState)
    return bestState // or resign? or skip?
  }

  /** 
   * EvaluateNextState: recurse with lookahead after playing hex.
   * @param hex play stone to Hex and evaluate the board
   * @param stoneColor evaluate from this players POV
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
    function* asifPlayerMove(): YieldR<object> {
      let hex = gamePlay.curHex
      hex.setColor(stoneColor)                 // getCaptures(), allStones.push(stone)

      // setup board for gStats.update(); as if having made a Move(hex, stoneColor)
      // captured already set by outer getCapture; w/undoRecs to [re-] addStone!
      move = new Move(hex, stoneColor, gamePlay.captured) // presumably achieve 'state1'
      gamePlay.history.unshift(move)                      // to compute Board & board.repCount
      gamePlay.setBoardAndRepCount(move)                  // set/reduce repCount to actual value 
      let win = gamePlay.gStats.update()                  // use GameStats: do NOT showRepCount(), showWin()
      if (!win && nPlys < TP.maxPlys) {
        let other = otherColor(stoneColor)
        // Depth-First search: find moves from state1 to bestHex
        let result: IteratorResult<any, State>, planGen = planner.lookahead(state1, other, nPlys, (state2: State) => {
          console.log(stime(this, `.asifPlayerMove: lookahead`), { move1: move.Aname, state1: copyOf(state1), move2: state2.move.Aname, state2: copyOf(state2) })
          if (-state2.bestValue < state1.bestValue) {
            state1.bestValue = -state2.bestValue // MIN
            state1.bestHex = hex
          }
        })
        if (nPlys < TP.maxPlys)  yield
        while (result = planGen.next(), !result.done) yield
      }
      //console.log(stime(this, `.asifPlayerMove: undoInf=`), gamePlay.undoInfluence)
      gamePlay.history.shift()
      myWin = win         // record 'win' at top of stack. (overwriting other wins...)
      return { Aname: move.Aname, bv: state1?.bestValue }
      // hex.clearColor()
      // getCaptures will: undoInfluence.close().pop(), undoRecs.close().pop(); this.captured === move.captures
    }
    //yieldR(this.getCaptures(hex, stoneColor, asifPlayerMove())).next()
    let asifGen = asifPlayerMove()
    let result: IteratorResult<any, Hex[]>, capGen = this.getCaptures(hex, stoneColor, asifGen)
    while (result = capGen.next(), !result.done) yield
    let stateR = false || this.evalState(stoneColor, move, myWin)     // zero order value after playing hex on hexMap
    stateR.hex = hex
    if (bestState.bestValue < stateR.bestValue) {
      bestState.move = move                     // (hex, stoneColor, gamePlay.captured)
      bestState.bestValue = stateR.bestValue
      bestState.bestHex = bestState.hex = hex   // <====
    }
    return stateR // return for evalSomeMoves: moves.set(hex, stateR); later stateR will be supplied as state1
  }
  *getCaptures(hex: Hex, color: StoneColor, genR?: YieldR<object>) {
    let gamePlay = this.gamePlay
    let pcaps = gamePlay.captured; gamePlay.captured = []
    let undo0 = gamePlay.undoRecs, undoInf = gamePlay.undoInfluence
    gamePlay.undoInfluence = new Undo().enableUndo()
    gamePlay.undoRecs = new Undo().enableUndo()
    gamePlay.curHex = hex                // immune from capture; later check suicide
    gamePlay.assertInfluence(hex, color) // may invoke captureStone() -> undoRec(Stone & capMark)
    // capture may *remove* some inf & InfMarks!
    let suicide = hex.isAttack(otherColor(color)), rv = suicide ? undefined : gamePlay.captured
    if (genR) {
      let result: IteratorResult<void, object>
      while (result = genR.next(), !result.done) yield
      let { bv, moveName } = (result.value as { bv, moveName })
      if (!!bv) console.log(stime(this, `.getCaptures: move =`), moveName, bv, rv ? rv : 'suicide')
    }
    gamePlay.undoInfluence.closeUndo().pop()
    gamePlay.undoRecs.closeUndo().pop()    // like undoStones(); SHOULD replace captured Stones/Colors
    // TODO: addStone(hex) above, and do this always. But addStone() always generates undoRec vs when captured.
    if (!!hex.stoneColor) {            // if: func() {hex.setStone}; esp if undo(capture) -> addStone(hex)
      gamePlay.undoRecs.isUndoing = true
      gamePlay.removeStone(hex)            // remove without an undoRec!
      gamePlay.undoRecs.isUndoing = false
    }
    gamePlay.undoRecs = undo0; gamePlay.undoInfluence = undoInf
    gamePlay.undoCapMarks(gamePlay.captured); // undoCapture
    gamePlay.captured = pcaps
    return rv
  }
  /** 
   * Initialize state0 with hex & bestHex = skipHex(-Infinity)
   * 
   * find some MOVES from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * return State with { moves: MOVES, and proximal bestMove, bestValue }
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return a State with MOVES
   */
  *evalSomeMoves(state0: State, stoneColor: StoneColor) { //: [Hex, State][]
    let gamePlay = this.gamePlay              // this.gamePlay: hexMap, history, allBoards, ...
    let moves = state0.moves = new Map<Hex,State>()
    // In case there are NO LEGAL MOVES, set skipHex:
    state0.hex = state0.bestHex = this.gamePlay.hexMap.skipHex //  presumably bestValue = value
    //console.log(stime(this, `.evalSomeMoves: state0 in:`), Obj.objectFromEntries(state0))
    let hexGen = new HexGen(gamePlay).gen(), result: IteratorResult<Hex, void>
    // Find/Gen the legal moves *before* evalMoveInDepth changes gStats/pStats:
    let hexGenA = Array.from(hexGen)
    for (let hex of hexGenA) {
      //let state = yieldR(this.evalMoveInDepth(hex, stoneColor, TP.maxPlys, state0, undefined)).next() // get zeroth-order value of hex on hexMap
      let evalGen = this.evalMoveInDepth(hex, stoneColor, TP.maxPlys, state0, undefined)
      let result: IteratorResult<void, State>
      while (result = evalGen.next(), !result.done) yield
      let state = result.value
      state0.moves.set(hex, state)
    }
    //console.log(stime(this, `.evalSomeMoves: state0 out:`), state0.bestHex?.Aname, Obj.objectFromEntries(state0))
    let moveAry = Array.from(moves.entries()).sort(([ha,sa], [hb,sb]) => sb.value - sa.value) // descending
    return moveAry
  }
}
/**
 * 1. evalSomeMoves as generator, so can yield the initial value; then sort and proceed with the good ones.
 * ... but: not the MOVE generator; store state of board at [leaf] nodes of search graph.
 * ... QQQ: do we store the whole hexMap? or just history or Board (from which we can recreate hexMap)? TIME vs SPACE
 * ... AAA: first try save hexMap; and nullify refs in obsolete STATES.
 * Also: keep 'allBoard' with link to the eval-node, so can find it even if not in first tier of nodes.
 * 1b. gen->[gen: Iterable, value: number]; sort on [2], 
 * 2. use internal HexMap<hex> to dodge all the graphics (now that it works)
 * 2b. read move0 to see which hex was updated
 * 3? maintain tree of forecast: prune when other player makes actual move; expand at the remaaining leafs.
 * 
 */

/** generate pairs of Pair<HexGen, value> */
class HexGen2 {
  constructor (private gamePlay: GamePlay0) {}
  hexes = new Set<Hex>()
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move 'curPlayer' made
  color = otherColor(this.move0.stoneColor) // my StoneColor
  threats = this.gamePlay.gStats.pStat(this.color).hThreats

  ;*gen0() {
    yield this.checkHex(this.alignHex(this.move0.hex))
    for (let hex of this.threats)
      yield this.checkHex(this.alignHex(hex))
    yield this.checkHex(this.alignHex(this.move1.hex))
    yield this.checkHex(this.alignHex(this.move0.hex))
    for (let [dn, hex] of Object.entries(this.move0.hex.links))
      yield this.checkHex(this.radGen(hex, dn))
  }


  ; *gen1(): Generator<Hex, void, unknown> {
    yield *this.checkHex(this.alignHex(this.move0.hex))
    for (let hex of this.threats)
      yield* this.checkHex(this.alignHex(hex))
    yield *this.checkHex(this.alignHex(this.move1.hex))
    yield *this.checkHex(this.alignHex(this.move0.hex))
    for (let [dn, hex] of Object.entries(this.move0.hex.links))
      yield* this.checkHex(this.radGen(hex, dn))
  }
  ; *radGen(hex, dn) {
    while (hex = hex.links[dn]) yield hex // follow links[dn] from hex to edge of hexMap
  }
  ; *checkHex(hexary: Iterable<Hex>, pred?: (hex: Hex, color: StoneColor) => boolean) {
    for (let nHex of hexary) {
      if (this.hexes.has(nHex)) continue
      if (!pred) this.hexes.add(nHex)
      if (!this.gamePlay.isLegalMove(nHex, this.color, pred)) continue
      this.hexes.add(nHex)
      yield nHex                // new move && not suicide
    }
  }

  /** Hexes that an on-axis to the given Hex */
  alignHex(hex: Hex) {
    let genHex = this.radialHex(hex)
    return this.checkHex(genHex)
  }
  ; *radialHex(hex: Hex) {
    for (let dn of Object.keys(hex.links)) {    // extend in each radial direction
      let nHex = hex
      while (nHex = nHex.links[dn]) yield nHex
    }
    return
  }
}

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
    yield* this.alignHex(this.move0.hex)
    if (this.move1) yield* this.adjacentHex(this.move1.hex)
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