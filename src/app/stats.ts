// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { Board, GamePlay, GamePlay0, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, stoneColors, TP } from "./table-params";
import { C, F, ParamGUI, ParamItem, ParamLine, ParamType, ValueCounter } from "@thegraid/createjs-lib";
import { Text } from "createjs-module";

export class PlayerStats {
  gStats: GameStats;
  plyr: Player; // 
  op: Player;   // op = this.table.otherPlayer(this.plyr)

  dStones: number[] = [0];      // per-district (initialize district 0)
  dMinControl: boolean[] = [];  // per-district true if minControl of district
  dMax: number = 0;      // max dStones in non-Central District
  nStones: number = 0;   // total on board
  nInf: number = 0;      // (= nStones*6 - edge effects - E/W-underlap)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone) 'jeopardy'
  nAttacks: number = 0;  // (Hex w/ inf >= 2) 'unplayable by opponent'

  get rStones(): number  { return this.op.stats.nStones};   // [op].nStones
  get rInf(): number     { return this.op.stats.rInf};      // [op].nInf
  get rThreats(): number { return this.op.stats.nThreats};  // [op].nStones
  get rAttacks(): number { return this.op.stats.nAttacks};  // [op].nStones

  constructor(plyr: Player, gStats: GameStats) {
    this.gStats = gStats
    let nDist = gStats.hexMap.nDistricts
    this.dStones = Array(nDist).fill(0, 0, nDist)
    this.dMinControl = Array(nDist).fill(false, 0, nDist)
    plyr.stats = this
    this.plyr = plyr
    this.op = plyr.otherPlayer
  }
}

export class GameStats {
  hexMap: HexMap
  pStats: PlayerStats[] = [] // indexed by StoneColor
  allPlayers: Player[]
  inControl:  StoneColor[] = [] // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color
  score(color: StoneColor): number {
    return this.inControl.filter(ic => ic == color).length
  }

  /** extract the useful bits for maintaining stats. */
  constructor(hexMap: HexMap, allPlayers: Player[]) {
    this.hexMap = hexMap
    this.allPlayers = allPlayers
    this.setupStatVector()           // use default wVector
  }
  pStat(color: StoneColor): PlayerStats { return this.pStats[color] }
  zeroCounters() {
    let nDist = TP.ftHexes(TP.mHexes)
    this.inControl = Array<StoneColor>(nDist)      // undefined
    this.allPlayers.forEach((p) => this.pStats[p.color] = new PlayerStats(p, this))
  }
  incCounters(hex: Hex) {
    // count Stones of color (& in District)
    let stone = hex.stone
    if (!!stone) {
      let color = stone.color, district = hex.district, pstats = this.pStats[color] as PlayerStats
      pstats.nStones += 1
      let dStones = pstats.dStones[district] = (pstats.dStones[district] || 0) + 1
      if (district !== 0 && dStones > pstats.dMax) pstats.dMax = dStones
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
  /** compute pstats, return StonColor of winner (or undefined) */
  update(board: Board): StoneColor {
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    this.zeroCounters()
    this.hexMap.forEachHex((hex) => this.incCounters(hex))
    let win: StoneColor
    // forEachDistrict(d => {})
    for (let d = 0; d < nDist; d++) {
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
  return win
  }  

  // Mixin to compute weighted summaryStat over pStats
  wVector: number[] = []
  plyrColors: StoneColor[]   // Player colors by plyr.index
  setupStatVector () {
    let nDist = TP.ftHexes(TP.mHexes)  // each MetaHex is a District
    this.plyrColors = this.allPlayers.map(plyr => plyr.color)
    let dStoneM = new Array<number>(nDist).fill(1, 0, nDist)
    let s0M = 1.3, dMaxM = 1, dist0M = 1, nStoneM = 1.1, nInfM = .3, nThreatM = .2, nAttackM = .5
    this.wVector = dStoneM.concat([s0M, dMaxM, dist0M, nStoneM, nInfM, nThreatM, nAttackM])
  }
  statVector(pid: number, gStats: GameStats): number[] {
    let color = this.plyrColors[pid]
    let pstat = gStats.pStat(color)
    let score = gStats.score(color)
    let nDist0 = pstat.dStones[0]
    let { dStones, dMax, nStones, nInf, nThreats, nAttacks } = pstat
    return dStones.concat(score, dMax, nDist0, nStones, nInf, nThreats, nAttacks)
  }
  mulVector(v0: number[], v1: number[]): number[] { // v0 = dotProd(v0, v1)
    for (let i in v0 ) v0[i] *= v1[i]
    return v0
  }
  sumVector(v0: number[]): number {
    return v0.reduce((sum, cv) => sum+cv, 0)
  }
  getSummaryStat(gStats: GameStats, pNdx: number, wVec = this.wVector) {
    let sv = this.statVector(pNdx, gStats)
    this.mulVector(sv, wVec)
    return this.sumVector(sv)
  }


}
export class TableStats extends GameStats {
  table: Table         // presence indicates a GUI environment: showControl, showBoardRep
  gamePlay: GamePlay0  // provides hexMap & allPlayers[]
  boardRep: Text
  dStonesText: Text[] = []

  sStat(color: StoneColor): number {
    let pNdx = this.allPlayers.findIndex(plyr => plyr.color === color)
    return this.getSummaryStat(this, pNdx)
  }
  // turn?
  constructor(gamePlay: GamePlay0, table: Table) {
    super(gamePlay.hexMap, gamePlay.allPlayers)
    this.gamePlay = gamePlay
    this.setTable(table)
    this.zeroCounters()
  }
  setTable(table: Table) {
    this.table = table    // table points to: nextHex Container (for BoardRepCount)
  }
  showBoardRep(n: number) {
    let repText = this.boardRep
    if (!repText) {
      repText = this.boardRep =  new Text('0', F.fontSpec(36), C.YELLOW)
      repText.textAlign = 'center'
      if (!!this.table) {
        this.table.nextHex.localToLocal(0, -46, this.table.hexMap.stoneCont, repText)
        this.table.hexMap.stoneCont.addChild(repText)
      }
    }
    repText.text = `${n}`
    repText.color = (n < 3) ? C.YELLOW : C.RED
    repText.visible = (n >= 0)
  }
  /** update all the stats */
  override update(board: Board): StoneColor {
    const win = super.update(board)
    this.showBoardRep(board.repCount)
    if (!!this.table) {
      this.table.statsPanel.update()
      this.showControl(this.table)
      this.hexMap.update()
    }
    if (this.gameOver(board, win)) {
      let plyr = this.gamePlay.curPlayer, pc = plyr.color, pStats = plyr.stats
      let op = this.gamePlay.nextPlayer, opc = op.color, opStats = op.stats
      if (!!win) return this.showWin(board, win, `WINS! ${opc} loses`)
      if (board.resigned) return this.showWin(board, opc, `WINS: ${pc} RESIGNS`)
      if (board.repCount == 3) return this.showWin(board, pc, `-- ${opc} STALEMATE: ns(${pStats.nStones} -- ${opStats.nStones})`)
    }
    return win
  }
  gameOver(board: Board, win: StoneColor): boolean {
    return (!!win || !!board.resigned || board.repCount == 3) // win, lose, draw...
  }
  showWin(board: Board, win: StoneColor, text: string): StoneColor {
    let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
    setTimeout(() => alert(`${win} ${text}! ${winS} -- ${loseS}`), 200)
    return win
  }
  showControl(table: Table) {
    let hexMap = table.miniMap
    hexMap.forEachHex(hex => {
      table.clearStone(hex)                // from mimi-map
      let ic = this.inControl[hex.district]
      if (ic !== undefined) {
        let stone = new Stone(ic)
        hex.setStone(stone)
        table.setStone(stone, hex) // on mini-map
      }
      this.showDSText(hex)
    })
  }
  setupDSText(table: Table) {
    // setup dStoneText:
    let nd = table.gamePlay.hexMap.nDistricts
    for (let district = 0; district< nd; district++){
      let dsText = new Text(``, F.fontSpec(26)); // radius/2 ?
      dsText.textAlign = 'center';
      dsText.color = C.WHITE
      dsText.rotation = -table.miniMap.hexCont.parent.rotation
      this.dStonesText[district] = dsText
    }
  }
  getDSText(hex: Hex) {
    let district = hex.district, dsText = this.dStonesText[district]
    if (!dsText) {
      dsText = new Text(``, F.fontSpec(26)); // radius/2 ?
      dsText.textAlign = 'center';
      dsText.color = C.WHITE
      dsText.rotation = - hex.map.hexCont.parent.rotation
      this.dStonesText[district] = dsText
    }
    return dsText
  }
  showDSText(hex: Hex) {
    let district = hex.district
    let n0 = this.pStat(stoneColor0).dStones[district]
    let n1 = this.pStat(stoneColor1).dStones[district]
    let dsText = this.getDSText(hex)
    hex.map.infCont.addChild(dsText)
    hex.localToLocal(7, -10, hex.map.infCont, dsText) // rotation from (0,-15)
    dsText.text = (n0 == 0 && n1 == 0) ? `` : `${n0}:${n1}`
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
  inControl(d: StoneColor)  { return this.gStats.inControl[this.plyr.color][d]; }

 */

/** A "read-only" version of ParamGUI, to display value of target[fieldName] */
export class StatsPanel extends ParamGUI {

  gStats: TableStats
  bFields = ['score', 'sStat'] //
  pFields = ['nStones', 'nInf', 'nThreats', 'nAttacks', 'dMax'] // 'dStones', 'dMinControl', 
  constructor(gStats: TableStats) {
    super(gStats)    // but StatsPanel.setValue() does nothing
    this.gStats = gStats
  }
  targetValue(target: object, fieldName: string, color: StoneColor) {
    let value = target[fieldName] as (color: StoneColor) => any | Array<StoneColor>
    if (typeof(value) === "function") {
      return value.call(target, color)
    } else {
      return target[color][fieldName]
    }
  }
  setValueText(line: ParamLine) {
    let fieldName = line.spec.fieldName
    let lineValue = "?"
    let target = this.pFields.includes(fieldName) ? this.gStats.pStats : this.gStats
    let v0 = this.targetValue(target, fieldName, stoneColor0).toFixed(0)
    let v1 = this.targetValue(target, fieldName, stoneColor1).toFixed(0)
    lineValue = `${v0} --  ${v1}   `

    line.chooser._rootButton.text.text = lineValue
  }
  /** when a new value is selected, push it back into the target object */
  // Note: return value is never used!
  override selectValue(fieldName: string, value?: ParamType, line?: ParamLine): ParamItem | undefined {
    line = line || this.findLine(fieldName)
    if (!line) return null
    // instead of chooser.select(item), invoke setValueText(line)
    this.setValueText(line)
    // invoke onChanged() for those which have supplied one.
    let item = line.spec.choices.find(item => (item.fieldName === fieldName))
    line.chooser.changed(item)
    return item
  }
  /** read-only... do nothing, unless spec.onChange(...) */
  override setValue(item: ParamItem): void {  }

  update() {
    this.pFields.forEach(fieldName => this.selectValue(fieldName))
    this.bFields.forEach(fieldName => this.selectValue(fieldName))
  }
}


