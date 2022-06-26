// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { Board, GamePlay } from "./game-play";
import { Hex, Hex2, HexM } from "./hex";
import { Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, StoneColorRecord, stoneColorRecordF, stoneColors, TP } from "./table-params";
import { C, F, S, stime } from "@thegraid/easeljs-lib";
import { ParamGUI, ParamItem, ParamLine, ParamType, ParamOpts, ParamSpec, DropdownButton} from '@thegraid/easeljs-lib'// './ParamGUI' //
import { Text } from "@thegraid/easeljs-module";
import { H } from "./hex-intfs";
export type WINARY = [Board, StoneColor, number, number]
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
    let distLen = TP.nDistricts // gStats.hexMap.nDistricts; 
    this.dStones = Array(distLen).fill(0, 0, distLen)
    this.dMinControl = Array(distLen).fill(false, 0, distLen)
  }
}

export class GameStats {
  readonly hexMap: HexM
  readonly pStats: StoneColorRecord<PlayerStats>
  readonly inControl: StoneColor[] = Array(TP.ftHexes(TP.mHexes)) // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color
  winVP: StoneColor = undefined;
  get s0() { return this.score(stoneColor0) }
  get s1() { return this.score(stoneColor1) }
  get ds() { return this.score(stoneColor0) - this.score(stoneColor1) }

  get n0() { return this.pStats[stoneColor0].nStones }
  get n1() { return this.pStats[stoneColor1].nStones }
  get dn() { return this.pStats[stoneColor0].nStones - this.pStats[stoneColor1].nStones }

  winAny: StoneColor = undefined;
  score(color: StoneColor): number {
    return this.inControl.filter(ic => ic == color).length
  }

  /** extract the useful bits for maintaining stats. */
  constructor(hexMap: HexM,
    pStats: Record<StoneColor, PlayerStats> = stoneColorRecordF(() => new PlayerStats()), 
    inControl: StoneColor[] = Array(TP.ftHexes(TP.mHexes))) {
    this.hexMap = hexMap
    this.pStats = pStats
    this.inControl = inControl
    this.setupStatVector()           // use default wVector
  }

  adjDistrict(hex: Hex, color: StoneColor) {
    let inc = (hex.stoneColor === color) ? +1 : -1
    let pstat = this.pStat(color)
    pstat.dStones[hex.district] += inc
    pstat.dMax = Math.max(...pstat.dStones.slice(1))
  }

  pStat(color: StoneColor): PlayerStats { return this.pStats[color] }
  zeroCounters(distLen = this.inControl.length) {
    this.inControl.fill(undefined, 0, distLen)
    stoneColors.forEach((color) => this.pStats[color] = new PlayerStats())
  }
  incCounters(hex: Hex) {
    // count Stones of color (& in District)
    let hColor = hex.stoneColor
    if (hColor !== undefined) {
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
      if (hex.stoneColor == pColor) return // do not count pColor influence on pColor Stones
      let infColor = H.infDirs.filter(dn => hex.isInf(pColor,dn)).length
      if (infColor > 0) {
        pstats.nInf++
        if (infColor > 1) pstats.nAttacks++
        if (hColor !== undefined && hColor !== pColor) {
          pstats.nThreats++
          pstats.hThreats.push(hex)
        }
      }
    })
  }
  /** compute pstats, return StoneColor of winner (or undefined) */
  updateStats(board?: Board): [StoneColor, WINARY] {
    this.zeroCounters()
    let distLen = this.inControl.length; // = TP.ftHexes(TP.mHexes) -  1
    this.hexMap.forEachHex((hex) => this.incCounters(hex)) // set nStones, dStones, etc
    let winVP: StoneColor
    // forEachDistrict(d => {})
    for (let d = 0; d < distLen; d++) {
      stoneColors.forEach(color => {
        let pstats = this.pStats[color]
        let dStones = pstats.dStones[d]
        let min = pstats.dMinControl[d] = (dStones >= TP.nMinControl)
        if (min && dStones - (this.pStats[otherColor(color)].dStones[d] || 0) >= TP.nDiffControl) {
          this.inControl[d] = color
          if (this.score(color) >= TP.nVictory) winVP = color
        }
      })
    }
    this.winVP = winVP
    let winAry: WINARY = [board, this.winVP, this.ds, this.dn]
    let win = this.gameOver(...winAry)
    board && (board.winAry = winAry)
    return [win, winAry]
  }
  /** victory, resigned, stalemate; win = gStats.gameOver(...board.winAry) */
  gameOver(board: Board, winVP: StoneColor, ds: number, dn: number): StoneColor {
    return this.winAny = (winVP !== undefined) ? winVP : !board ? undefined
      : board.resigned ? otherColor(board.resigned)
        : (board.repCount < 3) ? undefined
          : ((ds == 0 ? (dn <= 0 ? stoneColor1 : stoneColor0)
            : ((ds > 0) ? stoneColor0 : stoneColor1)))
  }

  // Mixin to compute weighted summaryStat over pStats for Planner:
  wVector: number[] = []
  setupStatVector() {
    let distLen = this.inControl.length
    let dStonesM = new Array<number>(distLen).fill(1, 0, distLen)
    dStonesM[0] = 1.1
    let scoreM = 1.3, dMaxM = 1, nStonesM = 1.1, nInfM = .3, nThreatsM = .2, nAttacksM = .5, nAdjM = .1
    this.wVector = dStonesM.concat([scoreM, dMaxM, nStonesM, nInfM, nThreatsM, nAttacksM, nAdjM])
  }
  statVector(color: StoneColor): number[] {
    let pstat = this.pStat(color)
    let score = this.score(color)
    let { dStones, dMax, nStones, nInf, nThreats, nAttacks, nAdj } = pstat
    return dStones.concat(score, dMax, nStones, nInf, nThreats, nAttacks, nAdj)
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
/**
 * GameStats with Table/GUI
 */
export class TableStats extends GameStats {
  // provide nextHex, hexMap.mapCont, statsPanel, miniMap
  table: Table         // presence indicates a GUI environment: showControl, showBoardRep
  boardRep: Text       // display repeatCount
  dStonesText: Text[] = []

  sStat(color: StoneColor): number {
    return this.getSummaryStat(color)
  }
  // TableStats:
  constructor(gamePlay: GamePlay, table: Table) {
    super(gamePlay.hexMap)
    this.table = table
  }

  showBoardRep(n: number) {
    let repText = this.boardRep
    if (!repText) {
      repText = this.boardRep =  new Text('0', F.fontSpec(36), C.YELLOW)
      repText.textAlign = 'center'
      if (!!this.table) {
        this.table.nextHex.cont.localToLocal(0, -46, this.table.hexMap.mapCont.stoneCont, repText)
        this.table.hexMap.mapCont.stoneCont.addChild(repText)
      }
    }
    repText.text = `${n}`
    repText.color = (n < 3) ? C.YELLOW : C.RED
    repText.visible = (n >= 0)
  }
  /** update all the stats 
   * @move0 if supplied, check move0.board for resign/stalemate
   */
  override updateStats(board?: Board): [StoneColor, WINARY] {
    const winAry = super.updateStats(board)
    const [win] = winAry
    if (!!this.table) {
      !!board && this.showBoardRep(board.repCount)
      this.table.statsPanel?.update()
      this.showControl(this.table)
    }
    if (win !== undefined) {
      let pc = win, pcr = TP.colorScheme[pc], pStats = this.pStat(pc)
      let opc = otherColor(pc), opcr = TP.colorScheme[opc], opStats = this.pStat(opc)
      if (board.resigned) this.showWin(board, pc, `${opcr} RESIGNS`)
      else if (board.repCount == 3) this.showWin(board, pc, `STALEMATE (${pStats.nStones} -- ${opStats.nStones})`)
      else this.showWin(board, pc, `${opcr} loses`)
    }
    return winAry
  }
  // TODO: align with nextHex(x & y), background
  showWin(board: Board, win: StoneColor, text: string): StoneColor {
    this.table.showRedoUndoCount()
    let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
    let winr = TP.colorScheme[win], msg = `${winr} WINS:\n${text}\n${winS} -- ${loseS}`
    console.log(stime(this, `.showWin:`), msg)
    this.showWinText(msg)
    return win
  }
  showWinText(msg?: string) {
    this.table.winText.text = msg || "COLOR WINS:\nSTALEMATE (10 -- 10)\n0 -- 0"
    this.table.winText.visible = this.table.winBack.visible = true
    if (!msg) this.hexMap.update()
  }
  /** show count Stones in each District (on miniMap) */
  showControl(table: Table) {
    this.table.winText.visible = this.table.winBack.visible = false
    let hexMap = table.miniMap; hexMap[S.Aname] = 'miniMap'
    hexMap?.forEachHex<Hex2>(hex => {
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
    let nd = TP.ftHexes(TP.mHexes)
    for (let district = 0; district< nd; district++){
      let dsText = new Text(``, F.fontSpec(26)); // radius/2 ?
      dsText.textAlign = 'center';
      dsText.color = C.WHITE
      dsText.rotation = -table.miniMap.mapCont.hexCont.parent.rotation
      this.dStonesText[district] = dsText
    }
  }
  getDSText(hex: Hex2) {
    let district = hex.district, dsText = this.dStonesText[district]
    if (!dsText) {
      dsText = new Text(``, F.fontSpec(26)); // radius/2 ?
      dsText.textAlign = 'center';
      dsText.color = C.WHITE
      dsText.rotation = - hex.map.mapCont.hexCont.parent.rotation
      this.dStonesText[district] = dsText
    }
    return dsText
  }
  showDSText(hex: Hex2) {
    let district = hex.district
    let n0 = this.pStat(stoneColor0).dStones[district]
    let n1 = this.pStat(stoneColor1).dStones[district]
    let dsText = this.getDSText(hex)
    hex.map.mapCont.infCont.addChild(dsText)
    if (hex.cont.rotation == 0)
      hex.cont.localToLocal(0, -12, hex.map.mapCont.infCont, dsText) // no rotation
    else
      hex.cont.localToLocal(7, -10, hex.map.mapCont.infCont, dsText) // rotation from (0,-12)
    dsText.text = (n0 == 0 && n1 == 0) ? `` : `${n0}:${n1}`
    dsText.color = (hex.stone?.color === undefined || C.dist(TP.colorScheme[hex.stone.color], C.WHITE)<100) ? C.BLACK : C.WHITE
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

  /**  StatsPanel.setValue() does nothing; StatsPanel.selectValue() -> setValueText(stat) */
  constructor(gStats: TableStats, defStyle = {}) {
    super(gStats, DropdownButton.mergeStyle(defStyle, DropdownButton.mergeStyle({ textAlign: 'center'})))
    this.gStats = gStats
  }
  override makeParamSpec(fieldName: string, ary: any[], opts?: ParamOpts): ParamSpec {
    let decimal = ary[1]
    let spec = super.makeParamSpec(fieldName, ary, opts)
    spec['decimal'] = decimal
    return spec
  }
  targetValue(target: object, color: StoneColor, fieldName: string) {
    let value = target[fieldName] as (color: StoneColor) => any | Array<StoneColor>
    if (typeof(value) === "function") {
      return value.call(target, color)
    } else {
      return target[color][fieldName]
    }
  }
  setValueText(line: ParamLine, decimal = 0) {
    let fieldName = line.spec.fieldName
    let lineValue = "?"
    let target = this.pFields.includes(fieldName) ? this.gStats.pStats : this.gStats
    let v0 = this.targetValue(target, stoneColor0, fieldName).toFixed(decimal)
    let v1 = this.targetValue(target, stoneColor1, fieldName).toFixed(decimal)
    lineValue = `${v0} -- ${v1}`

    line.chooser._rootButton.text.text = lineValue
  }
  /** when a new value is selected, push it back into the target object */
  // Note: return value is never used!
  override selectValue(fieldName: string, value?: ParamType, line?: ParamLine): ParamItem | undefined {
    line = line || this.findLine(fieldName)
    if (!line) return null
    let decimal = line.spec['decimal']
    // instead of chooser.select(item), invoke setValueText(line)
    this.setValueText(line, decimal)
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


