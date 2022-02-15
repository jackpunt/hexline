
// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { ParamGUI, ParamItem, ParamLine, ParamType } from "./param-gui";
import { Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, stoneColors, TP } from "./table-params";
import { ValueCounter } from "./value-counter";

export class PlayerStats {
  table: Table
  gamePlay: GamePlay
  bStats: BoardStats;
  plyr: Player; // 
  op: Player;   // op = this.table.otherPlayer(this.plyr)

  dStones: number[] = Array(7);       // per-district
  dMinControl: boolean[] = Array(7);  // per-district true if minControl of district
  nStones: number = 0;   // total on board
  nInf: number = 0;      // (= nStones*6 - edge effects - E/W-underlap)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone)
  nAttacks: number = 0;  // (Hex w/ inf >= 2)

  get rStones(): number  { return this.op.stats.nStones};   // [op].nStones
  get rInf(): number     { return this.op.stats.rInf};      // [op].nInf
  get rThreats(): number { return this.op.stats.nThreats};  // [op].nStones
  get rAttacks(): number { return this.op.stats.nAttacks};  // [op].nStones
  // -per District:
  inControl(d: StoneColor)  { return this.bStats.inControl[this.plyr.color][d]; }

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
  pStats: PlayerStats[] = [] // indexed by StoneColor
  // turn?
  // -per District: 
  minControl: boolean[][] = [] // (nStones[color] >= TP.minControl ) -> [dist][color] = true
  inControl:  StoneColor[] = [] // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color
  score(color: StoneColor): number {
    return this.inControl.filter(ic => ic == color).length
  }
  constructor(table: Table) {
    this.table = table
    this.gamePlay = table.gamePlay
    this.hexMap = table.gamePlay.hexMap
    this.zeroCounters()
  }
  pStat(color: StoneColor): PlayerStats { return this.pStats[color] }
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
      pstats.nStones += 1
      pstats.dStones[district] = (pstats.dStones[district] || 0) + 1
    }
    // count influence, threats, & attacks
    stoneColors.forEach(color => {
      let pstats = this.pStats[color] as PlayerStats
      let infColor = Object.keys(hex.inf[color]).length
      if (infColor > 0) {
        pstats.nInf++
        if (infColor > 1) pstats.nAttacks++
        if (!!stone && stone.color != color) {
          pstats.nThreats++
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
        if (min && dStones - ((this.pStats[otherColor(color)] as PlayerStats).dStones[d] || 0) >= TP.nDiffControl) {
          this.inControl[d] = color
          if (this.score(color) >= TP.nVictory) win = color
        }
      })
    }
    this.table.statsPanel.update()
    if (!!win) {
      this.hexMap.update()
      let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
      setTimeout(() => alert(`${win} WINS! ${winS} -- ${loseS}`), 200)
    }
  }
}
/**
  dStones: number[] = Array(7);       // per-district
  dMinControl: boolean[] = Array(7);  // per-district true if minControl of district
  nStones: number = 0;   // total on board
  nInf: number = 0;      // (= nStones*6 - edge effects - E/W-underlap)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone)
  nAttacks: number = 0;  // (Hex w/ inf >= 2)
  inControl(d: StoneColor)  { return this.bStats.inControl[this.plyr.color][d]; }

 */
export class StatsPanel extends ParamGUI {

  bStats: BoardStats
  bFields = ['score', ] //
  pFields = ['nStones', 'nInf', 'nThreats', 'nAttacks', ] // 'dStones', 'dMinControl', 
  constructor(bStats: BoardStats) {
    super()
    this.bStats = bStats
  }
  targetValue(target: object, fieldName: string, color: StoneColor) {
    let value = target[fieldName] as (color: StoneColor)=>any | Array<number>
    if (typeof(value) === "function") {
      return value.call(target, color)
    } else {
      return target[color][fieldName]
    }
  }
  setValueText(line: ParamLine) {
    let fieldName = line.spec.fieldName
    let lineValue = "?"
    let target = this.pFields.includes(fieldName) ? this.bStats.pStats : this.bStats
    let v0 = this.targetValue(target, fieldName, stoneColor0)
    let v1 = this.targetValue(target, fieldName, stoneColor1)
    let { width: w0, height: h0, text: t0 } = ValueCounter.ovalSize(v0)
    let { width: w1, height: h1, text: t1 } = ValueCounter.ovalSize(v1)
    lineValue = `${t0.text} --  ${t1.text}   `

    line.chooser._rootButton.text.text = lineValue
  }
  /** suitable entry-point for eval_params: (fieldName, value) */
  // Note: return value is never used!
  override selectValue(fieldName: string, value?: ParamType, line?: ParamLine): ParamItem | undefined {
    line = line || this.findLine(fieldName)
    if (!line) return null
    this.setValueText(line)
    return undefined
  }
  update() {
    this.pFields.forEach(fn => this.selectValue(fn))
    this.bFields.forEach(fn => this.selectValue(fn))
  }
}


