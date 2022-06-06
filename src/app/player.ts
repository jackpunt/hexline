import { stime, S } from "@thegraid/common-lib"
import { GamePlay } from "./game-play"
import { Hex, IHex } from "./hex"
import { HexEvent } from "./hex-event"
import { IPlanner, newPlanner } from "./plan-proxy"
import { Stone, Table } from "./table"
import { StoneColor, TP } from "./table-params"

export class Player {
  name: string
  index: number
  color: StoneColor
  otherPlayer: Player
  table: Table
  planner: IPlanner
  /** if true then invoke plannerMove */
  useRobo: boolean = false
  get colorn() { return TP.colorScheme[this.color] }
 
  constructor(index: number, color: StoneColor, table: Table) {
    this.index = index
    this.color = color
    this.table = table
    this.name = `Player${index}-${this.colorn}`
  }
  endGame(): void {
    this.planner?.terminate()
    this.planner = undefined
  }
  newGame(gamePlay: GamePlay) {
    this.planner?.terminate()
    this.planner = newPlanner(gamePlay.hexMap, this.index, gamePlay.logWriter)
  }
  stopMove() {
    this.planner.roboMove(false)
  }
  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  playerMove(stone: Stone, useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:
    console.log(stime(this, `(${this.colorn}).makeMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // start planner from top of stack:
      setTimeout(() => this.plannerMove(stone, this.table))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(stone: Stone, table: Table, incb = 0) {
    this.planner.roboMove(true)
    this.plannerRunning = true
    this.planner.makeMove(stone.color, table.gamePlay.history, incb).then((ihex: IHex) => {
      this.plannerRunning = false
      let hex = Hex.ofMap(ihex, table.hexMap)
      table.hexMap.showMark(hex)
      table.dispatchEvent(new HexEvent(S.add, hex, stone))
    })
  }
}
