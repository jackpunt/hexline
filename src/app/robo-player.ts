import { stime } from "@thegraid/createjs-lib";
import { Board, GamePlay0, Move, Mover, Player } from "./game-play";
import { Hex } from "./hex";
import { H } from "./hex-intfs";
import { GameStats } from "./stats";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, TP } from "./table-params";


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
  inControl(d: StoneColor)  { return this.gStats.inControl[this.plyr.color][d]; }
 */
export class Planner {
  gamePlay: GamePlay0
  // pcs: StoneColor[]   // Player colors by plyr.index
  weightVec0: number[] = []
  weightVec1: number[] = []
  weightVecs: { } = {}

  constructor(gamePlay: GamePlay0) {
    this.gamePlay = gamePlay
    // compatible with statVector in stats.ts
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    let dStoneM = new Array<number>(nDist).fill(1, 0, nDist)
    // s0 = inControl, dMax, district0, nStones, nInf
    let s0M0 = 1.3, dMaxM0 = 1, dist0M0 = 1, nStoneM0 = 1.1, nInfM0 = .3, nThreatM0 = .2, nAttackM0 = .5
    this.weightVec0 = dStoneM.concat([s0M0, dMaxM0, dist0M0, nStoneM0, nInfM0, nThreatM0, nAttackM0])
    this.weightVecs[stoneColor0] = this.weightVec0

    let s0M1 = 1.4, dMaxM1 = .9, dist0M1 = .8, nStoneM1 = 1.2, nInfM1 = .25, nThreatM1 = .25, nAttackM1 = .6
    this.weightVec1 = dStoneM.concat([s0M1, dMaxM1, dist0M1, nStoneM1, nInfM1, nThreatM1, nAttackM1])
    this.weightVecs[stoneColor1] = this.weightVec1

  }
  // after doPlayerMove (or undoMove...)
  getValue(color: StoneColor, update = false): number {
    let weightVec = this.weightVecs[color]
    let gamePlay = this.gamePlay
    let gStats = gamePlay.gStats
    update && gStats.update() // force re-calc of stats & sStat(w0)
    let s0 = gamePlay.gStats.getSummaryStat(gStats, color, weightVec)
    let s1 = gamePlay.gStats.getSummaryStat(gStats, otherColor(color), weightVec)
    return s0 - s1
  }
  getState(color: StoneColor, update?: boolean): State {
    let value = this.getValue(color, update)    // best move will maximize value
    return { move: this.gamePlay.history[0], color, bestValue: value, value }
  }
  maxPlys = 2
  spaceFill = "               ".substring(0, this.maxPlys)
  fill(nPlys: number) { return this.spaceFill.substring(0, this.maxPlys-nPlys) }

  /** play this Stone, Player is stone.color */
  makeMove(stone: Stone) {
    console.log(stime(this, `.makeMove: stone=`), stone)
    let state0 = this.doOnePly(stone.color) // get current state & potential moves
    let state = this.lookahead(state0, stone.color, this.maxPlys) // try someGoodMoves
    let hex = state.bestHex
    console.log(stime(this, `.makeMove: state=`), state)
    this.gamePlay.doPlayerMove(hex, stone)
  }
  /** 
   * lookahead from current State; with its potential MOVES
   * try someGoodMoves, update State values looking nPlys deep
   * otherColor has just moved: gamePlay in curState
   * find some good moves, play N of them, setting value(curState) 
   * return a State with bestValue, bestHex
   */
  lookahead(state0: State, color: StoneColor, nPlys: number): State {
    let stone = new Stone(color) // TODO: elide Stone, and play with StoneColor
    let breadth = 6, bestValue: number, bestHex: Hex, bestState: State
    let moveGen = this.someGoodMoves(state0.moves), other = otherColor(color)
    console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, `after ${state0.move.Aname}`)
    for (let [hex, state1a] of moveGen) {
      if (nPlys <= 0) return bestState          // stop recursion: return bestState with Move to bestHex
      if (--breadth <= 0) break
      if (!! bestValue && bestValue > state1a.value) break // lookahead would at best lower state value
      //gamePlay.doPlayerMove(hex, stone, false)          // play hex: return gamePlay to 'state'
      this.gamePlay.getCaptures(hex, color, (hex) => this.notPlayerMove(hex, stone))
      let state1 = state0 //this.doOnePly(color)               // same as 'state0' above
      let state2 = this.lookahead(state1, other, nPlys-1)     // Depth-First search: find moves from state1 to bestHex
      if (-state2.bestValue < state1.bestValue) state1.bestValue = -state2.bestValue // MIN
      if (!bestValue || state1.bestValue > bestValue) {
        bestValue = state1.bestValue; bestHex = hex; bestState = state1 // MAX (best of the worst)
      }
      //this.gamePlay.undoMove(false)
    }
    console.log(stime(this, `.lookahead: ${this.fill(nPlys)}`), nPlys, color, { bestValue, bestHex, bestState })
    return bestState
  }
  ; *someGoodMoves(moves: MOVES) {
    let moveAry = Array.from(moves.entries()).sort((a, b) => a[1].value - b[1].value)
    for ( let entry of moveAry) yield entry
  }
  // plugin to gamePlay.getCaptures(hex, color)
  notPlayerMove(hex: Hex, stone: Stone) {
    let gamePlay = this.gamePlay
    hex.setStone(stone)               // getCaptures() does not addStone()
    //gamePlay.addStone(hex, stone)   // sub-optimal... assertInfluence, addUndoRec

    // setup board for gStats.update(); as if having made a Move(hex, stone)
    let move = new Move(hex, stone)
    gamePlay.history.unshift(move)
    move.captured = gamePlay.captured        // set by outer getCapture
    move.board = gamePlay.allBoards.addBoard(gamePlay.nextPlayerIndex, move, gamePlay.hexMap)
    move.board.setRepCount(gamePlay.history) // >= 1 [should be NO-OP, from addBoard]
    gamePlay.gStats.update() // showRepCount(), showWin()
    gamePlay.history.shift()
    hex.setStone(undefined)
  }
  /** find some moves from this GamePlay state/history, 
   * return State with { moves: MOVES, and proximal bestMove, bestValue }
   */
  doOnePly(color: StoneColor): State {
    let gamePlay = this.gamePlay
    // assert: history[0] is valid (because first move has been done)
    // this.gamePlay: hexMap, history, allBoards, ...
    // do not need/have 'table.nextHex', just create a Stone for player:
    let state0 = this.getState(color)
    let moves = state0.moves = new Map<Hex,State>(), stone = new Stone(color)
    let bestHex: Hex, bestValue: number = 0
    console.log(stime(this, `.doOnePly: state0 in:`), state0)

    let hexes = new HexGen(gamePlay).gen(), result: IteratorResult<void | Hex, void>
    while ((result = hexes.next()) && !result.done) {
      let hex = (result.value as Hex)
      //gamePlay.doPlayerMove(hex, stone, false) // place stone, do gstats, NOT nextPlayer
      gamePlay.getCaptures(hex, color, () => this.notPlayerMove(hex, stone)) // update gStats
      let state = this.getState(color, false)
      moves.set(hex, state)
      //gamePlay.undoMove(false)  // allow new move by same player

      if (state.value > bestValue) {
        bestValue = state.value
        bestHex = hex
      }
    }
    state0.bestHex = bestHex; state0.bestValue = bestValue // best estimate of value at this ply
    console.log(stime(this, `.doOnePly: state0 out:`), bestHex.Aname, state0)
    return state0
  }
}

// move.hex, move.stone, move.board, move.board.captured, move.board.nextPlayerIndex
/** 
 * move is how we got here.. (move0) could be backlink? index into gamePlay.history?
 * value is current best estimate of value
 */
type State = { move: Move, color: StoneColor, value: number, moves?: MOVES, bestHex?: Hex, bestValue?: number } 
type MOVES = Map<Hex, State>
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
  plyr = this.gamePlay.curPlayer
  color = this.plyr.color
  move0 = this.gamePlay.history[0]  // last move otherPlayer made
  move1 = this.gamePlay.history[1]  // last move plyr made

  ; *gen() {
    yield* this.attackHex(this.move0.hex)
    yield* this.alignHex(this.move0.hex)
    yield* this.adjacentHex(this.move1.hex)
    for (let d  of [0, 1, 2, 3, 4, 5, 6]) yield* this.allHexInDistrict(d)
  }

  *checkHex(hexary: Iterable<Hex>, 
    pred?: (hex: Hex, color: StoneColor) => boolean) {
    for (let nHex of hexary) {
      // new move && not suicide:
      if (!this.hexes.has(nHex) && this.gamePlay.isLegalMove(nHex, this.color, pred)) yield nHex
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
      return !!caps && caps.includes(hex) // true if (not suicide and) hex was captured
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