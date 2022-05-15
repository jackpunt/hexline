import { stime, S } from "@thegraid/common-lib"
import { Mover, GamePlay0, GamePlay, GamePlayD } from "./game-play"
import { Hex } from "./hex"
import { HexEvent } from "./hex-event"
import { Planner } from "./planner"
import { Stone, Table } from "./table"
import { StoneColor, TP } from "./table-params"

export class Player implements Mover {
  name: string
  index: number
  color: StoneColor
  mover: Mover
  otherPlayer: Player
  gamePlay: GamePlay0
  planner: Planner
  useRobo: boolean = false
  get colorn() {return TP.colorScheme[this.color]}
 
  constructor(index: number, color: StoneColor, gamePlay: GamePlay0) {
    this.index = index
    this.color = color
    this.name = `Player${index}-${this.colorn}`
    this.gamePlay = gamePlay
  }
  newGame(gamePlay: GamePlay) {
    this.makeWorker()
    this.planner = new Planner(new GamePlayD(gamePlay, this), this.index)
  }
  stopMove() {
    this.planner.roboStop = true
  }
  makeMove(stone: Stone, useRobo = false) {
    let running = this.plannerRunning
    console.log(stime(this, `.makeMove: ${this.colorn} useRobo=`), this.useRobo, `running=${running}` )
    if (running) return
    this.planner.roboStop = false
    let table = (this.gamePlay instanceof GamePlay) && this.gamePlay.table
    if (useRobo || this.useRobo) {
      // start planner from top of stack:
      setTimeout(() => this.plannerMove(stone, table))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(stone: Stone, table: Table) {
    this.plannerRunning = true
    this.planner.makeMove(stone, table).then((hex: Hex) => {
      this.plannerRunning = false
      let origMap = table.gamePlay.hexMap
      let hex0 = hex.ofMap(origMap)
      table.hexMap.showMark(hex0)
      table.dispatchEvent(new HexEvent(S.add, hex0, stone))
    })
  }
  makeWorker() {
    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('./app.worker', import.meta.url));
      worker.onmessage = ({ data }) => {
        console.log(`page got message: ${data}`);
      };
      worker.postMessage('hello');
    } else {
      // Web Workers are not supported in this environment.
      // You should add a fallback so that your program still executes correctly.
    }
  }
}
