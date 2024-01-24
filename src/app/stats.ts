// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { C, DropdownButton, DropdownChoice, F, ParamGUI, ParamItem, ParamLine, ParamOpts, ParamSpec, ParamType, S, stime } from "@thegraid/easeljs-lib";
import { Text } from "@thegraid/easeljs-module";
import { Board, GamePlay } from "./game-play";
import { Hex, Hex2, HexM } from "./hex";
import { H } from "./hex-intfs";
import { Table } from "./table";
import { otherColor, PlayerColor, playerColor0, playerColor1, PlayerColorRecord, playerColorRecordF, playerColors, TP } from "./table-params";
export type WINARY = [Board, PlayerColor, number, number]
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
  readonly hexMap: HexM<Hex2>
  readonly pStats: PlayerColorRecord<PlayerStats>
  readonly inControl: PlayerColor[] = Array(TP.ftHexes(TP.mHexes)) // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color
  winVP: PlayerColor = undefined;
  get s0() { return this.score(playerColor0) }
  get s1() { return this.score(playerColor1) }
  get ds() { return this.score(playerColor0) - this.score(playerColor1) }

  get n0() { return this.pStats[playerColor0].nStones }
  get n1() { return this.pStats[playerColor1].nStones }
  get dn() { return this.pStats[playerColor0].nStones - this.pStats[playerColor1].nStones }

  winAny: PlayerColor = undefined;
  score(color: PlayerColor): number {
    return this.inControl.filter(ic => ic == color).length
  }

  /** extract the useful bits for maintaining stats. */
  constructor(hexMap: HexM<Hex>,
    pStats: Record<PlayerColor, PlayerStats> = playerColorRecordF(() => new PlayerStats()),
    inControl: PlayerColor[] = Array(TP.ftHexes(TP.mHexes))) {
    this.hexMap = hexMap as HexM<Hex2>;
    this.pStats = pStats
    this.inControl = inControl
    this.setupStatVector()           // use default wVector
  }

  adjDistrict(hex: Hex, color: PlayerColor) {
    let inc = (hex.playerColor === color) ? +1 : -1
    let pstat = this.pStat(color)
    pstat.dStones[hex.district] += inc
    pstat.dMax = Math.max(...pstat.dStones.slice(1))
  }

  pStat(color: PlayerColor): PlayerStats { return this.pStats[color] }
  zeroCounters(distLen = this.inControl.length) {
    this.inControl.fill(undefined, 0, distLen)
    playerColors.forEach((color) => this.pStats[color] = new PlayerStats())
  }
  incCounters(hex: Hex) {
    // count Stones of color (& in District)
    let hColor = hex.playerColor
    if (hColor !== undefined) {
      let district = hex.district, pstats = this.pStats[hColor]
      pstats.nStones += 1
      let dStones = pstats.dStones[district] = (pstats.dStones[district] || 0) + 1
      if (district !== 0 && dStones > pstats.dMax) pstats.dMax = dStones
      for (let nHex of Object.values(hex.links)) {
        if (nHex.playerColor === hColor) this.pStats[hColor].nAdj++
      }
    }
    // count influence, threats, & attacks
    playerColors.forEach(pColor => {
      let pstats = this.pStats[pColor]
      if (hex.playerColor == pColor) return // do not count pColor influence on pColor Stones
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
  /** compute pstats, return PlayerColor of winner (or undefined) */
  updateStats(board?: Board): [PlayerColor, WINARY] {
    this.zeroCounters()
    let distLen = this.inControl.length; // = TP.ftHexes(TP.mHexes) -  1
    this.hexMap.forEachHex((hex) => this.incCounters(hex)) // set nStones, dStones, etc
    let winVP: PlayerColor
    // forEachDistrict(d => {})
    for (let d = 0; d < distLen; d++) {
      playerColors.forEach(color => {
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
  gameOver(board: Board, winVP: PlayerColor, ds: number, dn: number): PlayerColor {
    return this.winAny = (winVP !== undefined) ? winVP : !board ? undefined
      : board.resigned ? otherColor(board.resigned)
        : (board.repCount < 3) ? undefined
          : ((ds == 0 ? (dn <= 0 ? playerColor1 : playerColor0)
            : ((ds > 0) ? playerColor0 : playerColor1)))
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
  statVector(color: PlayerColor): number[] {
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
  getSummaryStat(color: PlayerColor, wVec = this.wVector) {
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

  sStat(color: PlayerColor): number {
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
  override updateStats(board?: Board): [PlayerColor, WINARY] {
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
      if (board.resigned) this.showWin(pc, `${opcr} RESIGNS`)
      else if (board.repCount == 3) this.showWin(pc, `STALEMATE (${pStats.nStones} -- ${opStats.nStones})`)
      else this.showWin(pc, `${opcr} loses`)
    }
    return winAry
  }
  // TODO: align with nextHex(x & y), background
  showWin(win: PlayerColor, text: string): PlayerColor {
    this.table.showRedoUndoCount()
    let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
    let winr = TP.colorScheme[win], msg = `${winr} WINS:\n${text}\n${winS} -- ${loseS}`
    console.log(stime(this, `.showWin:`), msg)
    this.table.showWinText(msg)
    return win
  }
  /** show count Stones in each District (on miniMap) */
  showControl(table: Table) {
    this.table.winText.visible = this.table.winBack.visible = false
    const hexMap = table.miniMap;
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
    let n0 = this.pStat(playerColor0).dStones[district]
    let n1 = this.pStat(playerColor1).dStones[district]
    let dsText = this.getDSText(hex)
    hex.mapCont.infCont.addChild(dsText)
    if (hex.cont.rotation == 0)
      hex.cont.localToLocal(0, -12, hex.mapCont.infCont, dsText) // no rotation
    else
      hex.cont.localToLocal(7, -10, hex.mapCont.infCont, dsText) // rotation from (0,-12)
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
  inControl(d: PlayerColor)  { return this.gStats.inControl[this.plyr.color][d]; }
 */

/** A "read-only" version of ParamGUI, to display value of target[fieldName] */
export class StatsPanel extends ParamGUI {

  gStats: TableStats
  bFields = ['score', 'sStat'] //
  pFields = ['nStones', 'nInf', 'nThreats', 'nAttacks', 'dMax'] // 'dStones', 'dMinControl',
  valueSpace = "                   "       // could be set in constructor...

  /**  StatsPanel.setValue() does nothing; StatsPanel.selectValue() -> setValueText(stat) */
  constructor(gStats: TableStats, defStyle = {}) {
    super(gStats, DropdownButton.mergeStyle(defStyle, DropdownButton.mergeStyle({ arrowColor: '0', textAlign: 'center'})))
    this.gStats = gStats
  }
  /** very dodgy to pass the 'decimal' number as ary[0] */
  override makeParamSpec(fieldName: string, ary: any[] = [], opts: ParamOpts = {}): ParamSpec {
    let decimal = ary[0]
    opts.chooser = SC
    let spec = super.makeParamSpec(fieldName, [this.valueSpace], opts)
    spec['decimal'] = decimal
    return spec
  }
  targetValue(target: object, color: PlayerColor, fieldName: string) {
    let value = target[fieldName] as (color: PlayerColor) => any | Array<PlayerColor>
    if (typeof(value) === "function") {
      return value.call(target, color)
    } else {
      return target[color][fieldName]
    }
  }
  /** show 'fieldName[0] -- fieldName[1]' in _rootButton.text.text */
  override selectValue(fieldName: string, value?: ParamType, line = this.findLine(fieldName)) {
    if (!line) return null
    let decimal = line.spec.choices[0]
    let lineValue = "?"
    let target = this.pFields.includes(fieldName) ? this.gStats.pStats : this.gStats
    let v0 = this.targetValue(target, playerColor0, fieldName).toFixed(decimal)
    let v1 = this.targetValue(target, playerColor1, fieldName).toFixed(decimal)
    lineValue = `${v0} -- ${v1}`
    let chooser = line.chooser as SC
    chooser._rootButton.text.text = lineValue
    return undefined as ParamItem // Note: return value is never used!
  }

  /** read-only... do nothing, unless spec.onChange(...) */
  override setValue(item: ParamItem): void {  }

  update() {
    this.pFields.forEach(fieldName => this.selectValue(fieldName))
    this.bFields.forEach(fieldName => this.selectValue(fieldName))
  }
}
/** StatChoice: never expand the [sp] item */
class SC extends DropdownChoice {
  /** never expand */
  override rootclick(): void {}
}

