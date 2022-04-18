import { Obj, S, stime } from "@thegraid/createjs-lib";
import { Board, GamePlay, GamePlay0, Move, Mover, Player } from "./game-play";
import { Hex, Hex2, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { H } from "./hex-intfs";
import { GameStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, stoneColorRecord, stoneColors, TP } from "./table-params";


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

  generateNextMoves(): Hex[] {
    // find axis of opponent
    // play close to that line
    return undefined
  }
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
      return { move, color, bestValue: value, value}
    }
    let other = otherColor(color)
    let s0 = this.gamePlay.gStats.getSummaryStat(color, weightVec)
    let s1 = this.gamePlay.gStats.getSummaryStat(other, weightVec)
    let value = s0 - s1 // best move for color will maximize value
    let hex = undefined; //this.gamePlay.hexMap.skipHex
    return { move, color, bestValue: value, value, hex, bestHex: hex } // moves is undefined
  }

  skipState(color: StoneColor, v0 = Number.NEGATIVE_INFINITY): State {
    let move = this.gamePlay.history[0], hex = this.gamePlay.hexMap.skipHex
    return { move, color, bestValue: v0, value: v0, hex, bestHex: hex }
  }
  resignState(color: StoneColor, v0 = Number.NEGATIVE_INFINITY): State {
    let move = this.gamePlay.history[0], hex = this.gamePlay.hexMap.resignHex
    return { move, color, bestValue: v0, value: v0, hex, bestHex: hex }
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
    if (!this.gamePlay.gStats) this.gamePlay.gStats = this.gamePlay.original.gStats.toGameStats()
    //console.log(stime(this, `.makeMove: stone=`), stone)
    this.gamePlay.gStats.update()
    let state0 = this.evalState(stone.color)
    let state = this.lookahead(state0, stone.color, 0) // try someGoodMoves
    let hex = state.bestHex
    let { move, color, bestValue, value, bestHex, hex: shex } = state
    let s0 = { move, color, bestValue: bestValue.toFixed(2), value: value.toFixed(2), bestHex, hex: shex }
    console.log(stime(this, `.makeMove: state=`), s0)
    if (table) {
      table.hexMap.showMark(hex)
      table.dispatchEvent(new HexEvent(S.add, hex, stone)) //
    }
  }
  /** 
   * lookahead from current State; with its potential MOVES
   * try someGoodMoves, update State values looking maxPlys deep
   * otherColor [state0.color] has just moved: gamePlay in curState
   * find some good moves, play N of them, setting value(curState) 
   * return a State with bestValue, bestHex
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return the State representing the bestHex to be played
   */
  lookahead(state0: State, stoneColor: StoneColor, nPlys: number): State {
    console.groupCollapsed(`lookahead-${nPlys}-${stoneColor} after ${otherColor(stoneColor)} ${this.gamePlay.history[0].hex.Aname}`)
    let moveAry = this.evalSomeMoves(state0, stoneColor) // generate first approx of possible moves
    console.log(stime(this, `.evalSomeMoves: hexGenA=`), moveAry.length, moveAry.map(([h,s]) => [h.Aname, Math.round(s.value*1000)/1000]))
    console.log(stime(this, `.loookahead: state0, initial:`), state0.bestHex?.Aname, Obj.objectFromEntries(state0))
    // if no legal moves, we can 'skip' for -Infinity, keeping the same state and value
    let breadth = 0, bestState = this.skipState(stoneColor)  // state0.value could be arbitrarily high... (and wrong)

    for (let [hex, state1a] of moveAry) {
      if (++breadth > TP.maxBreadth) break
      if (state1a.value < bestState.bestValue ) break // lookahead would at best lower state value
      this.evalMoveInDepth(hex, stoneColor, nPlys+1, bestState, state1a)  // see how good it really is...
    }
    console.groupEnd()
    //console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, { Aname: bestHex.Aname, bestHex, bestValue, bestState })
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
  evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number, bestState: State, state1?: State): State {
    let move: Move, myWin: StoneColor = undefined
    /** 
     * with stone on hex: compute move, board, gStats
     * then remove stone (and getCaptures will undo the rest)
     * 
     * plugin func for gamePlay.getCaptures(hex, color) 
     */
    let asifPlayerMove = (hex: Hex) => {
      let gamePlay = this.gamePlay
      hex.setColor(stoneColor)                 // getCaptures(), allStones.push(stone)

      // setup board for gStats.update(); as if having made a Move(hex, stoneColor)
      move = new Move(hex, stoneColor)         // presumably achieve 'state1'
      gamePlay.history.unshift(move)           // to set repCount
      move.captured = gamePlay.captured        // set by outer getCapture; w/undoRecs to [re-] addStone!
      move.board = gamePlay.allBoards.addBoard(move, gamePlay.hexMap)
      move.board.setRepCount(gamePlay.history) // >= 1 [should be NO-OP, from addBoard]
      let win = gamePlay.gStats.update()       // use GameStats: do NOT showRepCount(), showWin()
      if (!win && nPlys < TP.maxPlys) {
        let other = otherColor(stoneColor)
        let state2 = this.lookahead(state1, other, nPlys) // Depth-First search: find moves from state1 to bestHex
        if (-state2.bestValue < state1.bestValue) {
          state1.bestValue = -state2.bestValue // MIN
          state1.bestHex = hex
        }
      }
      //console.log(stime(this, `.asifPlayerMove: undoInf=`), gamePlay.undoInfluence)
      gamePlay.history.shift()
      myWin = win         // record 'win' at top of stack. (overwriting other wins...)
      // hex.clearColor()
      // getCaptures will: undoInfluence.close().pop(), undoRecs.close().pop(); this.captured
    }
    this.gamePlay.getCaptures(hex, stoneColor, asifPlayerMove)
    let stateR = state1 || this.evalState(stoneColor, move, myWin)     // zero order value after playing hex on hexMap
    stateR.hex = hex
    if (bestState.bestValue < stateR.bestValue) {
      bestState.bestValue = stateR.bestValue
      bestState.bestHex = bestState.hex = hex   // <====
    }
    return stateR
  }

  /** 
   * find some MOVES from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * return State with { moves: MOVES, and proximal bestMove, bestValue }
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return a State with MOVES
   */
  evalSomeMoves(state0: State, stoneColor: StoneColor): [Hex, State][] {
    let gamePlay = this.gamePlay              // this.gamePlay: hexMap, history, allBoards, ...
    let moves = state0.moves = new Map<Hex,State>()
    // In case there are NO LEGAL MOVES, set skipHex:
    state0.hex = state0.bestHex = this.gamePlay.hexMap.skipHex //  presumably bestValue = value
    //console.log(stime(this, `.evalSomeMoves: state0 in:`), Obj.objectFromEntries(state0))
    let hexGen = new HexGen(gamePlay).gen(), result: IteratorResult<Hex, void>
    // Find/Gen the legal moves *before* evalMoveInDepth changes gStats/pStats:
    let hexGenA = Array.from(hexGen)
    for (let hex of hexGenA) {
      let state = this.evalMoveInDepth(hex, stoneColor, TP.maxPlys, state0, undefined) // get zeroth-order value of hex on hexMap
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
export class Planner2 {
  original: GamePlay
  gamePlay: GamePlay0
  weightVecs: Record<StoneColor, number[]>
  maxPlys = 3

  constructor(gamePlay: GamePlay) {
    this.original = gamePlay
    this.gamePlay = new GamePlay0()  // same TP.mH/nH size, but no mapCont
    // use same Players:
    stoneColors.forEach((color, ndx) => this.gamePlay.allPlayers[ndx] = gamePlay.allPlayers[ndx])

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
  syncHexMap(hexMap: HexMap) {
    let myMap = this.gamePlay.hexMap
    hexMap.forEachHex((hex: Hex2) => {
      let row = hex.row, col = hex.col, myHex = myMap[row][col] 
      myHex.stoneColor = hex.stoneColor
    })
  }

  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table?: Table) {
    if (!this.gamePlay.gStats) this.gamePlay.gStats = this.gamePlay.original.gStats.toGameStats()
    this.syncHexMap(this.original.hexMap)

    //console.log(stime(this, `.makeMove: stone=`), stone)
    //let state0 = this.evalSomeMoves(stone.color) // eval current state & potential moves
    let state = this.lookahead(stone.color, this.maxPlys) // try someGoodMoves

    let hex = state.bestHex
    let { move, color, bestValue, value, bestHex } = state
    let s0 = { move, color, bestValue: bestValue.toFixed(2), value: value.toFixed(2), bestHex }
    console.log(stime(this, `.makeMove: state=`), s0)
    if (table) {
      table.hexMap.showMark(hex)
      table.dispatchEvent(new HexEvent(S.add, hex, stone)) //
    }
  }
  /** 
   * lookahead from current State; with its potential MOVES
   * try someGoodMoves, update State values looking nPlys deep
   * otherColor [state0.color] has just moved: gamePlay in curState
   * find some good moves, play N of them, setting value(curState) 
   * return a State with bestValue, bestHex
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return the State representing the bestHex to be played
   */
  lookahead(stoneColor: StoneColor, nPlys: number): State {
    console.groupCollapsed(`lookahead-${nPlys}-${stoneColor} after ${this.gamePlay.history[0].hex.Aname}`)
    //console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, `after ${state0.move.Aname}`)
    let breadth = 0, bestValue = Number.NEGATIVE_INFINITY, bestHex: Hex, bestState: State

    let hexGen = new HexGen(this.gamePlay).gen(), result: IteratorResult<Hex, void>
    let hexGenA = Array.from(hexGen)
    let moveAry0 = hexGenA.map(hex => {
      let evalr = this.evalMoveInDepth(hex, stoneColor, TP.maxPlys) // first order value
      let result = evalr.next()
      return { evalr, result }
    })
    let moveAry1 = moveAry0.filter((evalr_result) => !evalr_result.result.done)
    let moveAry2 = moveAry1.map(evalr_result => { return { evalr: evalr_result.evalr, state: evalr_result.result.value as State } })
    let moveAry = moveAry2.sort((a, b) => b.state.value - a.state.value) // descending value of State
    for (let evalr_state of moveAry) {
      if (breadth++ > TP.maxBreadth) break
      if (bestValue > evalr_state.state.value) break // lookahead would at best lower state value
      let hex = evalr_state.state.bestHex            // possibly the only Hex...
      let result = evalr_state.evalr.next(nPlys + 1)  // see how good it really is...
      if (!result.done) {
        let state = result.value as State
        if (state.bestValue > bestValue || state.bestValue === Number.NEGATIVE_INFINITY) {
          bestValue = state.bestValue; bestHex = hex; bestState = state // MAX (best of the worst)
        }
      }
    }
    console.groupEnd()
    //if (!bestState) bestState = this.resignState(stoneColor)
    //else bestState.bestHex = bestHex
    //console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, { Aname: bestHex.Aname, bestHex, bestValue, bestState })
    return bestState // or resign? or skip?
  }

  /** recurse with lookahead after playing hex.
   * @return State with bestHex to be played.
   */
  *evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number) {
    let myWin: StoneColor = undefined
    /** 
     * with stone on hex: compute move, board, gStats
     * then remove stone (and getCaptures will undo the rest)
     * 
     * plugin func for gamePlay.getCaptures(hex, color) 
     */
    let asifPlayerMove = (hex: Hex) => {
      let gamePlay = this.gamePlay
      // Only setColor, do not create a Stone:
      hex.setColor(stoneColor)               // getCaptures(), allStones.push(stone); does not addStone()
      //gamePlay.addStone(hex, stone)   // sub-optimal... assertInfluence, addUndoRec

      // setup board for gStats.update(); as if having made a Move(hex, stone)
      let move = new Move(hex, stoneColor)   // presumably achieve 'state1'
      gamePlay.history.unshift(move)           // to set repCount
      move.captured = gamePlay.captured        // set by outer getCapture; w/undoRecs to addStone!
      move.board = gamePlay.allBoards.addBoard(move, gamePlay.hexMap)
      move.board.setRepCount(gamePlay.history) // >= 1 [should be NO-OP, from addBoard]
      let win = gamePlay.gStats.update()       // use GameStats: do NOT showRepCount(), showWin()
      //let state = this.evalState(stoneColor)  // state ~~ state1: value, bestValue=value, bestHex
      //console.log(stime(this, `.asifPlayerMove: undoInf=`), gamePlay.undoInfluence)
      if (!win && nPlys < TP.maxPlys) {
        let other = otherColor(stoneColor)
        let state2 = this.lookahead(other, nPlys) // Depth-First search: find moves from state1 to bestHex
        if (-state2.bestValue < state.bestValue) state.bestValue = -state2.bestValue // MIN
      }
      //console.log(stime(this, `.asifPlayerMove: undoInf=`), gamePlay.undoInfluence)
      gamePlay.history.shift()
      myWin = win         // record 'win' at top of stack. (overwriting other wins...)
      // hex.clearColor()
      // getCaptures will: undoInfluence.close().pop(), undoRecs.close().pop(); this.captured
    }
    this.gamePlay.getCaptures(hex, stoneColor, asifPlayerMove)
    let state = this.evalState(stoneColor, myWin)     // zero order value after playing hex on hexMap
    yield state
  }

  /** Make a State object with simple value */
  evalState(color: StoneColor, win?: StoneColor): State {
    let move = this.gamePlay.history[0], weightVec = this.weightVecs[color]
    if (win) {
      let value = (win == color) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      return { move, color, bestValue: value, value}
    }
    let other = otherColor(color)
    let s0 = this.gamePlay.gStats.getSummaryStat(color, weightVec)
    let s1 = this.gamePlay.gStats.getSummaryStat(other, weightVec)
    let value = s0 - s1 // best move for color will maximize value
    return { move, color, bestValue: value, value }
  }  
}
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

/** 
 * move is how we got here.. (move0) could be backlink? index into gamePlay.history?
 * value is original estimate of value; 
 * bestValue is Max value over the evaluated MOVES; bestHex being the move that provides bestValue.
 */
type State = { move: Move, hex?: Hex, color: StoneColor, value: number, moves?: MOVES, bestHex?: Hex, bestValue?: number } 
type MOVES = Map<Hex, State> // move.hex, move.stone, move.board, move.board.captured
class HexGen {
  // moves that kill move0.hex: scan each of 6 axies, using getCaptures()
  // moves near *my* last move (history[1])
  // all moves in district <= 7 (and later: 19)

  // Note: getCaptures() does assertInfluence & removeStone and then invokes undoRecs & undoInfluence
  // we *could* place the stone & evaluate the board before the undo
  // we *could* copy the hexMap state and keep it in the move tree
  // Q: is it more expensise to do/influence/capture/undo OR copy-hexMap?
  // Can we make a hexMap & Hex[] without Shapes/Graphics?

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