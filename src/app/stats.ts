
// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { Table } from "./table";
import { otherColor, StoneColor, stoneColors, TP } from "./table-params";

export class PlayerStats {
  table: Table
  gamePlay: GamePlay
  bStats: BoardStats;
  plyr: Player; // 
  op: Player;   // op = this.table.otherPlayer(this.plyr)

  dStones: number[];       // per-district
  dMinControl: boolean[];  // per-district true if minControl of district
  nStones: number;   // total on board
  nInf: number;      // (= nStones*6 - edge effects - E/W-underlap)
  nThreats: number;  // (Hex w/ inf && [op].stone)
  nAttacks: number;  // (Hex w/ inf >= 2)

  get rStones(): number  { return this.op.stats.nStones};   // [op].nStones
  get rInf(): number     { return this.op.stats.rInf};      // [op].nInf
  get rThreats(): number { return this.op.stats.nThreats};  // [op].nStones
  get rAttacks(): number { return this.op.stats.nAttacks};  // [op].nStones
  // -per District:
  inControl(d)  { return this.bStats.inControl[this.plyr.color][d]; }
 
  constructor(plyr: Player, bStats: BoardStats) {
    this.bStats = bStats
    plyr.stats = this
    this.plyr = plyr
    this.table = plyr.table
    this.gamePlay = plyr.table.gamePlay
    this.op = this.table.otherPlayer(plyr)
  }
}
export class BoardStats {
  table: Table
  gamePlay: GamePlay
  hexMap: HexMap
  pStats: PlayerStats[] // indexed by StoneColor
  // turn?
  // -per District: 
  minControl: boolean[][] = [] // (nStones[color] >= TP.minControl ) -> [dist][color] = true
  inControl:  StoneColor[] = [] // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color

  constructor(table: Table) {
    this.table = table
    this.gamePlay = table.gamePlay
    this.hexMap = table.gamePlay.hexMap
    this.zeroCounters()
  }
  pStat(color: StoneColor): PlayerStats { return this.pStat[color] }
  zeroCounters() {
    this.minControl = Array<Array<boolean>>(7) // [district][color]
    this.inControl = Array<StoneColor>(7)
    this.table.allPlayers.forEach((p) => this.pStats[p.color] = new PlayerStats(p, this))
  }
  incCounters(hex: Hex) {
    // count Stones of color (& in District)
    let stone = hex.stone
    if (!!stone) {
      let color = stone.color, district = hex.district, pstats = this.pStats[color] as PlayerStats
      ++pstats.nStones
      ++pstats.dStones[district]
    }
    // count influence, threats, & attacks
    stoneColors.forEach(color => {
      let pstats = this.pStats[color] as PlayerStats
      let infColor = Object.keys(hex.inf[color]).length
      if (infColor > 0) {
        pstats.nInf++
        if (!!stone && stone.color != color) {
          pstats.nThreats++
          if (infColor > 1) pstats.nAttacks++
        }
      }
    })
  }
  update() {
    this.zeroCounters()
    this.hexMap.forEachHex((hex) => this.incCounters(hex))
    let win: StoneColor | ""
    // forEachDistrict(d => {})
    for (let d = 0; d < 7; d++) {
      stoneColors.forEach(color => {
        let pstats = this.pStats[color] as PlayerStats
        let dStones = pstats.dStones[d]
        let min = pstats.dMinControl[d] = (dStones >= TP.nMinControl)
        if (min && dStones - (this.pStats[otherColor(color)] as PlayerStats).dStones[d] >= TP.nDiffControl) {
          this.inControl[d] = color
          win = (this.inControl[d].length >= TP.nVictory) && color
        }
      })
    }
    if (!!win) alert(`Win! ${win}`)
  }
}


