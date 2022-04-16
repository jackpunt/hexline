// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { Board, GamePlay0, Player } from "./game-play";
import { Hex, Hex2, HexMap } from "./hex";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, stoneColorRecord, stoneColors, TP } from "./table-params";
import { C, F, S, stime } from "@thegraid/createjs-lib";
import { ParamGUI, ParamItem, ParamLine, ParamType, } from '@thegraid/createjs-lib'
import { Text } from "createjs-module";

export class PlayerStats {

  readonly dStones: number[] = [0];      // per-district (initialize district 0)
  readonly dMinControl: boolean[] = [];  // per-district true if minControl of district
  dMax: number = 0;      // max dStones in non-Central District
  nStones: number = 0;   // total on board
  nInf: number = 0;      // (= nStones*6 - edge effects - E/W-overlap)
  hThreats: Hex[] = [];  // Hexes with opponent & 1 threat (possible attack)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone) 'jeopardy' (hThreats.length)
  nAttacks: number = 0;  // (Hex w/ inf >= 2) 'unplayable by opponent'
  nAdj: number = 0;      // number of adjacent stones [compactness]

  constructor() {
    let distLen = TP.ftHexes(TP.mHexes) // gStats.hexMap.nDistricts; 
    this.dStones = Array(distLen).fill(0, 0, distLen)
    this.dMinControl = Array(distLen).fill(false, 0, distLen)
  }
}

export class GameStats {
  readonly hexMap: HexMap
  readonly allPlayers: Player[]
  readonly pStats: Record<StoneColor, PlayerStats> = stoneColorRecord()
  readonly inControl:  StoneColor[] = Array(TP.ftHexes(TP.mHexes)) // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color
  score(color: StoneColor): number {
    return this.inControl.filter(ic => ic == color).length
  }

  /** extract the useful bits for maintaining stats. */
  constructor(hexMap: HexMap, allPlayers: Player[], 
    pStats: Record<StoneColor, PlayerStats> = stoneColorRecord(new PlayerStats(), new PlayerStats()), 
    inControl: StoneColor[] = Array(TP.ftHexes(TP.mHexes))) {
    this.hexMap = hexMap
    this.allPlayers = allPlayers
    this.pStats = pStats
    this.inControl = inControl
    this.setupStatVector()           // use default wVector
  }
  toGameStats() {
    // remove TableStats methods:
    return new GameStats(this.hexMap, this.allPlayers, this.pStats, this.inControl)
  }

  pStat(color: StoneColor): PlayerStats { return this.pStats[color] }
  zeroCounters(distLen = this.inControl.length) {
    this.inControl.fill(undefined, 0, distLen)
    stoneColors.forEach((color) => this.pStats[color] = new PlayerStats())
  }
  incCounters(hex: Hex) {
    // count Stones of color (& in District)
    let hColor = hex.stoneColor
    if (!!hColor) {
      let district = hex.district, pstats = this.pStats[hColor]
      pstats.nStones += 1
      let dStones = pstats.dStones[district] = (pstats.dStones[district] || 0) + 1
      if (district !== 0 && dStones > pstats.dMax) pstats.dMax = dStones
      for (let nHex of Object.values(hex.links)) {
        if (nHex.stoneColor === hColor) this.pStats[hColor].nAdj++
      }
    }
    // count influence, threats, & attacks
    stoneColors.forEach(pColor => {
      let pstats = this.pStats[pColor]
      let infColor = Object.keys(hex.inf[pColor]).length
      if (infColor > 0) {
        pstats.nInf++
        if (infColor > 1) pstats.nAttacks++
        if (!!hColor && hColor != pColor) {
          pstats.nThreats++
          pstats.hThreats.push(hex)
        }
      }
    })
  }
  /** compute pstats, return StoneColor of winner (or undefined) */
  update(): StoneColor {
    this.zeroCounters()
    let distLen = this.inControl.length; // = TP.ftHexes(TP.mHexes) -  1
    this.hexMap.forEachHex((hex) => this.incCounters(hex)) // set nStones, dStones, etc
    let win: StoneColor
    // forEachDistrict(d => {})
    for (let d = 0; d < distLen; d++) {
      stoneColors.forEach(color => {
        let pstats = this.pStats[color]
        let dStones = pstats.dStones[d]
        let min = pstats.dMinControl[d] = (dStones >= TP.nMinControl)
        if (min && dStones - (this.pStats[otherColor(color)].dStones[d] || 0) >= TP.nDiffControl) {
          this.inControl[d] = color
          if (this.score(color) >= TP.nVictory) win = color
        }
      })
    }
  return win
  }  

  // Mixin to compute weighted summaryStat over pStats
  wVector: number[] = []
  setupStatVector() {
    let distLen = this.inControl.length
    let dStoneM = new Array<number>(distLen).fill(1, 0, distLen)
    let s0M = 1.3, dMaxM = 1, dist0M = 1, nStoneM = 1.1, nInfM = .3, nThreatM = .2, nAttackM = .5, nAdjM = .1
    this.wVector = dStoneM.concat([s0M, dMaxM, dist0M, nStoneM, nInfM, nThreatM, nAttackM, nAdjM])
  }
  statVector(color: StoneColor): number[] {
    let pstat = this.pStat(color)
    let score = this.score(color)
    let nDist0 = pstat.dStones[0]
    let { dStones, dMax, nStones, nInf, nThreats, nAttacks, nAdj } = pstat
    return dStones.concat(score, dMax, nDist0, nStones, nInf, nThreats, nAttacks, nAdj)
  }
  mulVector(v0: number[], v1: number[]): number[] { // v0 = dotProd(v0, v1)
    for (let i in v0 ) v0[i] *= v1[i]
    return v0
  }
  sumVector(v0: number[]): number {
    return v0.reduce((sum, cv) => sum+cv, 0)
  }
  getSummaryStat(color: StoneColor, wVec = this.wVector) {
    let sv = this.statVector(color)
    this.mulVector(sv, wVec)
    return this.sumVector(sv)
  }
}
export class TableStats extends GameStats {
  table: Table         // presence indicates a GUI environment: showControl, showBoardRep
  gamePlay: GamePlay0  // provides hexMap & allPlayers[] & curPlayer, history for WIN detection
  boardRep: Text
  dStonesText: Text[] = []

  sStat(color: StoneColor): number {
    return this.getSummaryStat(color)
  }
  // TableStats:
  constructor(gamePlay: GamePlay0, table: Table) {
    super(gamePlay.hexMap, gamePlay.allPlayers)
    this.gamePlay = gamePlay
    this.setTable(table)
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
        this.table.nextHex.cont.localToLocal(0, -46, this.table.hexMap.stoneCont, repText)
        this.table.hexMap.stoneCont.addChild(repText)
      }
    }
    repText.text = `${n}`
    repText.color = (n < 3) ? C.YELLOW : C.RED
    repText.visible = (n >= 0)
  }
  /** update all the stats 
   * @board if supplied, check for win/resign/stalemate
   */
  override update(): StoneColor {
    const win = super.update()
    let move0 = this.gamePlay.history[0], board = move0 && move0.board
    if (!!this.table) {
      !!board && this.showBoardRep(board.repCount)
      this.table.statsPanel.update()
      this.showControl(this.table)
      this.hexMap.update()
    }
    if (!!board && this.gameOver(board, win)) {
      let pc = move0.stoneColor, pcr = TP.colorScheme[pc], pStats = this.pStat(pc)
      let opc = otherColor(pc), opcr = TP.colorScheme[opc], opStats = this.pStat(opc)
      if (!!win) return this.showWin(board, win, `WINS! ${opcr} loses`)
      if (board.resigned) return this.showWin(board, opc, `WINS: ${pcr} RESIGNS`)
      if (board.repCount == 3) return this.showWin(board, pc, `-- ${opcr} STALEMATE: ns(${pStats.nStones} -- ${opStats.nStones})`)
    }
    return win
  }
  gameOver(board: Board, win: StoneColor): boolean {
    return (!!win || !!board.resigned || board.repCount == 3) // win, lose, draw...
  }
  showWin(board: Board, win: StoneColor, text: string): StoneColor {
    let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
    let winr = TP.colorScheme[win], msg = `${winr} ${text}! ${winS} -- ${loseS}`
    console.log(stime(this, `.showWin:`), msg)
    setTimeout(() => alert(msg), 200)
    return win
  }
  showControl(table: Table) {
    let hexMap = table.miniMap; hexMap[S.Aname] = 'miniMap'
    hexMap.forEachHex<Hex2>(hex => {
      hex.clearColor()     // from mimi-map
      let ic = this.inControl[hex.district]
      if (ic !== undefined) {
        hex.setColor(ic)
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
  getDSText(hex: Hex2) {
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
  showDSText(hex: Hex2) {
    let district = hex.district
    let n0 = this.pStat(stoneColor0).dStones[district]
    let n1 = this.pStat(stoneColor1).dStones[district]
    let dsText = this.getDSText(hex)
    hex.map.infCont.addChild(dsText)
    if (hex.cont.rotation == 0)
      hex.cont.localToLocal(0, -12, hex.map.infCont, dsText) // no rotation
    else
      hex.cont.localToLocal(7, -10, hex.map.infCont, dsText) // rotation from (0,-12)
    dsText.text = (n0 == 0 && n1 == 0) ? `` : `${n0}:${n1}`
    dsText.color = (!hex.stone?.color || C.dist(TP.colorScheme[hex.stone.color], C.WHITE)<100) ? C.BLACK : C.WHITE
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
  constructor(gStats: TableStats, defStyle?) {
    super(gStats, defStyle)    // but StatsPanel.setValue() does nothing
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


