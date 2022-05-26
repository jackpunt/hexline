import { stime, S } from "@thegraid/common-lib"
import { Mover, GamePlay } from "./game-play"
import { Hex, IHex } from "./hex"
import { HexEvent } from "./hex-event"
import { IPlanner, newPlanner } from "./plan-proxy"
import { Stone, Table } from "./table"
import { StoneColor, TP } from "./table-params"

export class Player implements Mover {
  name: string
  index: number
  color: StoneColor
  mover: Mover
  otherPlayer: Player
  table: Table
  planner: IPlanner
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
    this.planner = newPlanner(gamePlay.hexMap, this.index)
  }
  stopMove() {
    this.planner.roboMove(false)
  }
  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  makeMove(stone: Stone, useRobo = false) {
    let running = this.plannerRunning
    // feedback for KeyMove:
    console.log(stime(this, `(${this.colorn}).makeMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    this.planner.roboMove(true)
    if (useRobo || this.useRobo) {
      // start planner from top of stack:
      setTimeout(() => this.plannerMove(stone, this.table))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(stone: Stone, table: Table) {
    this.plannerRunning = true
    this.planner.makeMove(stone.color, table.gamePlay.history).then((ihex: IHex) => {
      this.plannerRunning = false
      let hex = Hex.ofMap(ihex, table.hexMap)
      table.hexMap.showMark(hex)
      table.dispatchEvent(new HexEvent(S.add, hex, stone))
    })
  }
}
