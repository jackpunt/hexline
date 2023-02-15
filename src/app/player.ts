import { stime, S } from "@thegraid/common-lib"
import { GamePlay } from "./game-play"
import { IHex } from "./hex"
import { HgClient } from "./HgClient"
import { IPlanner, newPlanner } from "./plan-proxy"
import { Table } from "./table"
import { PlayerColor, TP } from "./table-params"

export class Player {
  name: string
  index: number
  color: PlayerColor
  otherPlayer: Player
  table: Table
  planner: IPlanner
  /** if true then invoke plannerMove */
  useRobo: boolean = false
  get colorn() { return TP.colorScheme[this.color] }

  constructor(index: number, color: PlayerColor, table: Table) {
    this.index = index
    this.color = color
    this.table = table
    this.name = `Player${index}-${this.colorn}`
  }
  endGame(): void {
    this.planner?.terminate()
    this.planner = undefined
  }
  static remotePlayer = 1 // temporary, bringup-debug
  newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    this.planner?.terminate()
    // this.hgClient = (this.index == Player.remotePlayer) ? new HgClient(url, (hgClient) => {
    //   console.log(stime(this, `.hgClientOpen!`), hgClient)
    // }) : undefined
    this.planner = newPlanner(gamePlay.hexMap, this.index, gamePlay.logWriter)
  }
  stopMove() {
    this.planner.roboMove(false)
  }
  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  playerMove(sc: PlayerColor, useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.colorn}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // start plannerMove from top of stack:
      setTimeout(() => this.plannerMove(sc, incb))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(sc: PlayerColor, incb = 0) {
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
class RemotePlayer extends Player {
  override newGame(gamePlay: GamePlay) {
    this.planner?.terminate()
    //this.hgClient = (this.index == RemotePlayer.remotePlayer) ? new HgClient() : undefined
    this.planner = newPlanner(gamePlay.hexMap, this.index, gamePlay.logWriter)
  }
}
