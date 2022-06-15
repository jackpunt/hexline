import { stime, S } from "@thegraid/common-lib"
import { GamePlay } from "./game-play"
import { IHex } from "./hex"
import { IPlanner, newPlanner } from "./plan-proxy"
import { Table } from "./table"
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
  playerMove(sc: StoneColor, useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:
    
    TP.log > 0 && console.log(stime(this, `(${this.colorn}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // start plannerMove from top of stack:
      setTimeout(() => this.plannerMove(sc))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(sc: StoneColor, incb = 0) {
    this.planner.roboMove(true)
    this.plannerRunning = true
    let iHistory = this.table.gamePlay.iHistory
    let ihexPromise = this.planner.makeMove(sc, iHistory, incb)
    ihexPromise.then((ihex: IHex) => {
      this.plannerRunning = false
      this.table.moveStoneToHex(ihex, sc)
    })
  }
}
