import { Obj, S, stime } from "@thegraid/createjs-lib";
import { Board, GamePlay0, Move, Mover, Player } from "./game-play";
import { Hex } from "./hex";
import { HexEvent } from "./hex-event";
import { H } from "./hex-intfs";
import { GameStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, stoneColorRecord, TP } from "./table-params";


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

  /** Make a State object with simple value */
  evalState(color: StoneColor, win?: StoneColor): State {
    let move = this.gamePlay.history[0], weightVec = this.weightVecs[color]
    if (win) {
      let value = (win == color) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      return { move, color, bestValue: value, value}
    }
    let gamePlay = this.gamePlay, gStats = gamePlay.gStats, other = otherColor(color)
    let s0 = gamePlay.gStats.getSummaryStat(gStats, color, weightVec)
    let s1 = gamePlay.gStats.getSummaryStat(gStats, other, weightVec)
    let value = s0 - s1 // best move for color will maximize value
    return { move, color, bestValue: value, value }
  }
  maxPlys = 5
  spaceFill = "               ".substring(0, this.maxPlys)
  fill(nPlys: number) { return this.spaceFill.substring(0, this.maxPlys-nPlys) }

  resignState(color: StoneColor): State {
    let v0 = Number.NEGATIVE_INFINITY, resignHex = this.gamePlay.hexMap.resignHex 
    return { move: undefined, color, bestValue: v0, value: v0, bestHex: resignHex}
  }
  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone, table?: Table) {
    if (!this.gamePlay.gStats) this.gamePlay.gStats = this.gamePlay.original.gStats.toGameStats()
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
    //console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, `after ${state0.move.Aname}`)
    let breadth = 8, bestValue = Number.NEGATIVE_INFINITY, bestHex: Hex, bestState: State
    let state0 = this.evalSomeMoves(stoneColor) // generate first approx of possible moves
    let moveAry = Array.from(state0.moves.entries()).sort((a, b) => b[1].value - a[1].value) // descending
    for (let [hex, state1a] of moveAry) {
      if (--breadth < 0) break
      if (bestValue > state1a.value) break // lookahead would at best lower state value
      let state1 = this.evalMoveInDepth(hex, stoneColor, nPlys-1, state1a)  // see how good it really is...
      if (state1.bestValue > bestValue || state1.bestValue === Number.NEGATIVE_INFINITY) {
        bestValue = state1.bestValue; bestHex = hex; bestState = state1 // MAX (best of the worst)
      }
    }
    if (!bestState) bestState = this.resignState(stoneColor)
    else bestState.bestHex = bestHex
    //console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, { Aname: bestHex.Aname, bestHex, bestValue, bestState })
    return bestState // or resign? or skip?
  }

  /** recurse with lookahead after playing hex.
   * @return State with bestHex to be played.
   */
  evalMoveInDepth(hex: Hex, stoneColor: StoneColor, nPlys: number, state1?: State): State {
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
      if (!win && nPlys > 0) {
        let other = otherColor(stoneColor)
        let state2 = this.lookahead(other, nPlys) // Depth-First search: find moves from state1 to bestHex
        if (-state2.bestValue < state1.bestValue) state1.bestValue = -state2.bestValue // MIN
      }
      //console.log(stime(this, `.asifPlayerMove: undoInf=`), gamePlay.undoInfluence)
      gamePlay.history.shift()
      myWin = win         // record 'win' at top of stack. (overwriting other wins...)
      // hex.clearColor()
      // getCaptures will: undoInfluence.close().pop(), undoRecs.close().pop(); this.captured
    }
    this.gamePlay.getCaptures(hex, stoneColor, asifPlayerMove)
    return state1 || this.evalState(stoneColor, myWin)     // zero order value after playing hex on hexMap
  }

  /** 
   * find some MOVES from this GamePlay state/history,  and assign base value/State to each.
   * temp-make each move and score the gamePlay.
   * return State with { moves: MOVES, and proximal bestMove, bestValue }
   * @param stoneColor evaluate from POV of given Player (generally, the next Player to move)
   * @return a State with MOVES
   */
  evalSomeMoves(stoneColor: StoneColor): State {
    let gamePlay = this.gamePlay
    // assert: history[0] is valid (because first move has been done)
    // this.gamePlay: hexMap, history, allBoards, ...
    // do not need/have 'table.nextHex', just create a Stone for player:
    let state0 = this.evalState(stoneColor)
    let moves = state0.moves = new Map<Hex,State>()
    let bestHex: Hex, bestValue: number = Number.NEGATIVE_INFINITY // state0.bestValue, state0.value
    //console.log(stime(this, `.evalSomeMoves: state0 in:`), Obj.objectFromEntries(state0))

    let hexGen = new HexGen(gamePlay).gen(), result: IteratorResult<Hex, void>
    while ((result = hexGen.next()) && !result.done) {
      let hex = result.value as Hex
      let state = this.evalMoveInDepth(hex, stoneColor, 0) // get zero-order value of hex on hexMap
      moves.set(hex, state)

      if (state.value > bestValue) {
        bestValue = state.value
        bestHex = hex
      }
    }
    state0.bestHex = bestHex; state0.bestValue = bestValue // best estimate of value at this ply
    //console.log(stime(this, `.evalSomeMoves: state0 out:`), bestHex.Aname, Obj.objectFromEntries(state0))
    return state0
  }
}

/** 
 * move is how we got here.. (move0) could be backlink? index into gamePlay.history?
 * value is original estimate of value; 
 * bestValue is Max value over the evaluated MOVES; bestHex being the move that provides bestValue.
 */
type State = { move: Move, color: StoneColor, value: number, moves?: MOVES, bestHex?: Hex, bestValue?: number } 
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

  constructor (private gamePlay: GamePlay0) {}
  hexes = new Set<Hex>()
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move 'curPlayer' made
  color = otherColor(this.move0.stoneColor)

  ; *gen() {
    yield* this.attackHex(this.move0.hex)
    yield* this.alignHex(this.move0.hex)
    if (this.move1) yield* this.adjacentHex(this.move1.hex)
    for (let d  of [0, 1, 2, 3, 4, 5, 6]) yield* this.allHexInDistrict(d)
  }

  *checkHex(hexary: Iterable<Hex>, 
    pred?: (hex: Hex, color: StoneColor) => boolean) {
    for (let nHex of hexary) {
      if (this.hexes.has(nHex)) continue
      this.hexes.add(nHex)
      if (!this.gamePlay.isLegalMove(nHex, this.color, pred)) continue
      yield nHex                // new move && not suicide
    }
  }

  //this.gamePlay.getCaptures(nHex, color)
  adjacentHex(hex: Hex) {
    return this.checkHex(Object.values(hex.links))  
  }
  allHexInDistrict(d: number) {
    return this.checkHex(this.gamePlay.hexMap.district[d])
  }
  alignHex(hex: Hex) {
    let genHex = this.radialHex(hex)
    return this.checkHex(genHex)
  }
  attackHex(hex: Hex) {
    let pred = (nhex: Hex, color: StoneColor) => {
      let caps = this.gamePlay.getCaptures(nhex, color)
      return caps?.includes(hex) // true if (not suicide and) hex was captured
    }
    let genHex = this.radialHex(hex)
    return this.checkHex(genHex, pred)
  }
  *radialHex(hex: Hex) {
    for (let dn of H.dirs) {    // extend in each radial direction
      let nHex = hex
      while (nHex = nHex.links[dn]) yield (nHex)
    }
    return
  }


}