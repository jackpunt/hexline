// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { Board, GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, stoneColors, TP } from "./table-params";
import { C, F, ParamGUI, ParamItem, ParamLine, ParamType, ValueCounter } from "@thegraid/createjs-lib";
import { Text } from "createjs-module";

export class PlayerStats {
  table: Table
  gamePlay: GamePlay
  bStats: MapStats;
  plyr: Player; // 
  op: Player;   // op = this.table.otherPlayer(this.plyr)

  dStones: number[] = Array(7);       // per-district
  dMinControl: boolean[] = Array(7);  // per-district true if minControl of district
  nStones: number = 0;   // total on board
  nInf: number = 0;      // (= nStones*6 - edge effects - E/W-underlap)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone) 'jeopardy'
  nAttacks: number = 0;  // (Hex w/ inf >= 2) 'unplayable by opponent'

  get rStones(): number  { return this.op.stats.nStones};   // [op].nStones
  get rInf(): number     { return this.op.stats.rInf};      // [op].nInf
  get rThreats(): number { return this.op.stats.nThreats};  // [op].nStones
  get rAttacks(): number { return this.op.stats.nAttacks};  // [op].nStones

  constructor(plyr: Player, bStats: MapStats) {
    this.bStats = bStats
    plyr.stats = this
    this.plyr = plyr
    this.table = plyr.table
    this.gamePlay = plyr.table.gamePlay
    this.op = this.table.otherPlayer(plyr)
  }
}

export class MapStats {
  hexMap: HexMap
  pStats: PlayerStats[] = [] // indexed by StoneColor
  allPlayers: Player[]
  minControl: boolean[][] = [] // (nStones[color] >= TP.minControl ) -> [dist][color] = true
  inControl:  StoneColor[] = [] // (nStones[color] - nStones[oc] >= TP.diffControl) -> [district]=color
  score(color: StoneColor): number {
    return this.inControl.filter(ic => ic == color).length
  }

  /** extract the useful bits for maintaining stats. */
  constructor(hexMap: HexMap, allPlayers: Player[]) {
    this.hexMap = hexMap
    this.allPlayers = allPlayers
  }
  pStat(color: StoneColor): PlayerStats { return this.pStats[color] }
  zeroCounters() {
    let nDist = TP.ftHexes(TP.mHexes)
    this.minControl = Array<Array<boolean>>(nDist) // [district][color]
    this.inControl = Array<StoneColor>(nDist)
    this.allPlayers.forEach((p) => this.pStats[p.color] = new PlayerStats(p, this))
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
  /** compute pstats, return StonColor of winner (or undefined) */
  update(board: Board): StoneColor {
    let nDist = TP.ftHexes(TP.mHexes)  // district for each MetaHex
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
}
export class TableStats extends MapStats {
  table: Table
  boardRep: Text
  // turn?
  constructor(table: Table) {
    super(table.gamePlay.hexMap, table.allPlayers)
    this.table = table    // table points to: allPlayers[] & gamePlay.hexMap
    this.zeroCounters()
  }
  showBoardRep(n: number) {
    let repText = this.boardRep
    if (!repText) {
      repText = this.boardRep =  new Text('0', F.fontSpec(36), C.YELLOW)
      repText.textAlign = 'center'
      this.table.nextHex.localToLocal(0, -46, this.table.hexMap.stoneCont, repText)
      this.table.hexMap.stoneCont.addChild(repText)
    }
    repText.text = `${n}`
    repText.color = (n < 3) ? C.YELLOW : C.RED
    repText.visible = (n >= 0)
  }
  /** update all the stats */
  override update(board: Board): StoneColor {
    const win = super.update(board)
    this.showBoardRep(board.repCount)
    // TODO: detect stalemate: (a) board.repCount == 3 [cycle|multiple-skipMove]
    // Stalemate Winner: most Disricts & fewest[!?] Stones.
    // TODO: resign
    this.table.statsPanel.update()
    this.showControl()
    if (!!win) return this.gameOver(board, "WINS", win)
    if (board.resigned) return this.gameOver(board, "RESIGNS") // nextPlayer, otherPlayer wins
    if (board.repCount == 3) return this.gameOver(board, "STALEMATE", win)
    return win
  }

  gameOver(board: Board, text: string, win = this.table.allPlayers[board.nextPlayerIndex].color): StoneColor {
    let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
    setTimeout(() => alert(`${lose} ${text}! ${winS} -- ${loseS}`), 200)
    return win
  }
  showControl() {
    let hexMap = this.table.miniMap
    hexMap.forEachHex(hex => {
      let d = hex.district, dc = hex.stoneColor, ic = this.inControl[d]
      if (ic !== dc) {
        if (!!dc) { this.table.clearStone(hex)} // from mimi-map
        else if (!!ic) { this.table.setStone(new Stone(ic), hex) } // on mini-map
      }
    })
    hexMap.update()
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

  bStats: TableStats
  bFields = ['score', ] //
  pFields = ['nStones', 'nInf', 'nThreats', 'nAttacks', ] // 'dStones', 'dMinControl', 
  constructor(bStats: TableStats) {
    super(bStats)    // but StatsPanel doesn't use the.setValue() 
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
    let item = line.spec.choices.find(item => (item.fieldName === fieldName))
    this.setValueText(line)
    line.chooser.changed(item)
    return undefined
  }
  update() {
    this.pFields.forEach(fieldName => this.selectValue(fieldName))
    this.bFields.forEach(fieldName => this.selectValue(fieldName))
  }
}


