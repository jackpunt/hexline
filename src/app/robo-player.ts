import { Board, GamePlay0, Move, Mover, Player } from "./game-play";
import { Hex } from "./hex";
import { GameStats } from "./stats";
import { Stone, Table } from "./table";
import { StoneColor } from "./table-params";


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
  pcs: StoneColor[]   // Player colors by plyr.index
  w0: number[] = []
  constructor(gamePlay: GamePlay0) {
    this.pcs = gamePlay.allPlayers.map(plyr => plyr.color)
    let dStoneM = new Array<number>(gamePlay.hexMap.nDistricts).fill(1, 0, gamePlay.hexMap.nDistricts)
    let s0M = 1.3, dMaxM = 1, nStoneM = 1.1, nInfM = .3, nThreatM = .2, nAttackM = .5
    this.w0 = dStoneM.concat([s0M, dMaxM, nStoneM, nInfM, nThreatM, nAttackM])
  }
  statVector(pid: number, gStats: GameStats): number[] {
    let color = this.pcs[pid]
    let pstat = gStats.pStat(color)
    let score = gStats.score(color)
    let { dStones, dMax, nStones, nInf, nThreats, nAttacks } = pstat
    return dStones.concat(score, dMax, nStones, nInf, nThreats, nAttacks)
  }
  mulVector(v0: number[], v1: number[]): number[] { // v0 = dotProd(v0, v1)
    for (let i in v0 ) v0[i] *= v1[i]
    return v0
  }
  sumVector(v0: number[]): number {
    return v0.reduce((sum, cv) => sum+cv, 0)
  }
  getSummaryStat(gStats: GameStats, pNdx: number) {
    let sv = this.statVector(pNdx, gStats)
    this.mulVector(sv, this.w0)
    return this.sumVector(sv)
  }
  // after doPlayerMove (or undoMove...)
  getScore(update = false): number {
    let gamePlay = this.gamePlay
    let hexMap = gamePlay.hexMap
    let history = gamePlay.history
    let move0 = history[0], stone = move0.stone, hex = move0.hex
    let board = move0.board
    let gStats = gamePlay.gStats
    update && gStats.update(board)
    let s0 = this.getSummaryStat(gStats, 0)
    let s1 = this.getSummaryStat(gStats, 1)
    return s0 - s1
  }

}