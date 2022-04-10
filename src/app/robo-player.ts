import { Board, GamePlay0, Move, Mover, Player } from "./game-play";
import { Hex } from "./hex";
import { H } from "./hex-intfs";
import { GameStats } from "./stats";
import { Stone, Table } from "./table";
import { StoneColor, TP } from "./table-params";


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
  constructor(gamePlay: GamePlay0) {
    this.gamePlay = gamePlay
    // compatible with statVector in stats.ts
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    let dStoneM = new Array<number>(nDist).fill(1, 0, nDist)
    let s0M = 1.3, dMaxM = 1, dist0M = 1, nStoneM = 1.1, nInfM = .3, nThreatM = .2, nAttackM = .5
    this.weightVec0 = dStoneM.concat([s0M, dMaxM, dist0M, nStoneM, nInfM, nThreatM, nAttackM])
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
    let s0 = gamePlay.gStats.getSummaryStat(gStats, 0, this.weightVec0)
    let s1 = gamePlay.gStats.getSummaryStat(gStats, 1, this.weightVec0)
    return s0 - s1
  }
  lookahead(pndx: number, nMoves: number) {
    // this.gamePlay: hexMap, history, allBoards, ...
    let hexes = new HexGen(this.gamePlay).gen(), result: IteratorResult<void | Hex, void>
    while ((result = hexes.next()) && !result.done) {
      let hex = (result.value as Hex)
    }
  }

}
class HexGen {
  // moves that kill move0.hex: scan each of 6 axies, using isNotSuicide()->captures
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
    pred: (hex: Hex, color: StoneColor) => boolean = (hex, color) => !!this.gamePlay.getCaptures(hex, color)) {
    for (let nHex of hexary) {
      // new move && not suicide:
      if (!this.hexes.has(nHex) && pred(nHex, this.color)) yield nHex
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
      return !!caps && caps.includes(hex)
    }
    let genHex = this.radialHex(hex)
    return this.checkHex(genHex, pred)
  }
  *radialHex(hex: Hex) {
    for (let dn of H.dirs) {
      let nHex = hex
      while (nHex = nHex.links[dn]) yield (nHex)
    }
    return
  }


}