import { stime, S } from "@thegraid/common-lib"
import { GamePlay } from "./game-play"
import { IHex } from "./hex"
import { HgClient } from "./HgClient"
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
  static remotePlayer = 1 // temporary, bringup-debug
  hgClient: HgClient
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
  playerMove(sc: StoneColor, useRobo = this.useRobo, incb = 0) {
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
  /**
   * execute code when network is being used:
   * 
   * isReferee can return false or true, so application can proceed as networked or standalone.
   * 
   * if notCurPlayer === undefined do NOTHING; if === true, use isCurPlayer
   * 
   * If isReferee === undefined, treat same as notCurPlayer, return true.
   * 
   * @param isCurPlayer invoked if hgClient is running curPlayer
   * @param notCurPlayer invoked if hgClient is NOT running curPlayer [true: use isCurPlayer()]
   * @param isReferee invoked if hgClient is running as Referee (false | return false: isNetworked->false)
   * @returns false if Table is running StandAlone (or referee...)
   */
  isNetworked(isCurPlayer?: (hgClient?: HgClient) => void,
    notCurPlayer?: true | ((hgClient?: HgClient) => void), 
    isReferee?: false | ((refClient?: HgClient) => boolean)): boolean {
    if (!this.hgClient.isOpen) return false    // running in standalone browser mode
    // if isReferee is not supplied: use otherPlayer(); but return true
    let otherPlayer = (notCurPlayer === true) ? isCurPlayer : notCurPlayer // can be undefined
    let asReferee = (isReferee !== undefined) ? isReferee
      : (otherPlayer !== undefined) ? (hgc: HgClient) => { otherPlayer(hgc); return true } : true
    if (this.hgClient.client_id === 0) {
      return typeof asReferee === 'function' ? asReferee(this.hgClient) : asReferee // hgClient is running as Referee
    } else if (this == this.table.gamePlay.curPlayer) {
      !!isCurPlayer && isCurPlayer(this.hgClient) // hgClient is running the curPlayer
    } else {
      !!otherPlayer && otherPlayer(this.hgClient) // hgClient is not running curPlayer
    }
    return true   // isNetworked: has an Open HgClient
  }
}
class RemotePlayer extends Player {
  override newGame(gamePlay: GamePlay) {
    this.planner?.terminate()
    this.hgClient = (this.index == RemotePlayer.remotePlayer) ? new HgClient() : undefined
    this.planner = newPlanner(gamePlay.hexMap, this.index, gamePlay.logWriter)
  }
}
