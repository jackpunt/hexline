import { Container, Stage } from "@thegraid/easeljs-module";
import { stime, makeStage, S } from "@thegraid/easeljs-lib";
import { ParamGUI, ParamItem} from '@thegraid/easeljs-lib' // './ParamGUI' //
import { GamePlay } from "./game-play";
import { StatsPanel, TableStats } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";
import { Hex2, HexMap } from "./hex";
import { ParamGUIP } from "./ParamGUIP";

/** initialize & reset & startup the application. */
export class GameSetup {
  static setup: GameSetup
  stage: Stage;
  gamePlay: GamePlay

  /** @param canvasId supply undefined for 'headless' Stage */
  constructor(canvasId: string) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    this.stage = makeStage(canvasId, false)
    GameSetup.setup = this
  }
  /** C-s ==> kill game, start a new one, possibly with new (mh,nh) */
  restart(mh = TP.mHexes, nh= TP.nHexes) {
    this.gamePlay.logWriter.closeFile()
    this.gamePlay.forEachPlayer(p => p.endGame())
    let deContainer = (cont: Container) => {
      cont.children.forEach(dObj => {
        dObj.removeAllEventListeners()
        if (dObj instanceof Container) deContainer(dObj)
      })
      cont.removeAllChildren()
    }
    deContainer(this.stage)
    TP.fnHexes(mh, nh)
    return this.startup()
  }
  /**
   * 
   * @param gs generally *this* GameSetup
   * @param ext Extensions from URL
   */
  startup(gs: GameSetup = this, ext: string[] = []) {
    let table = new Table(this.stage) // EventDispatcher, ScaleCont, GUI-Player
    let gamePlay = new GamePlay(table) // hexMap, players, gStats, mouse/keyboard->GamePlay
    this.gamePlay = gamePlay
    gamePlay.hexMap[S.Aname] = `mainMap`
    let statsx = -300, statsy = 30
    table.layoutTable(gamePlay)           // mutual injection, all the GUI components, fill hexMap
    gamePlay.forEachPlayer(p => p.newGame(gamePlay))        // make Planner *after* table & gamePlay are setup

    let statsPanel = this.makeStatsPanel(gamePlay.gStats, table.scaleCont, statsx, statsy)
    table.statsPanel = statsPanel
    let guiy = statsPanel.y + statsPanel.ymax + statsPanel.lead * 2
    console.groupCollapsed('initParamGUI')
    let [gui, gui2] = this.makeParamGUI(table, table.scaleCont, statsx, guiy) // modify TP.params...
    console.groupEnd()
    table.miniMap.mapCont.y = Math.max(gui.ymax, gui2.ymax)+gui.y + table.miniMap.wh.height/2
    table.startGame()
    return gamePlay
  }
  makeStatsPanel(gStats: TableStats, parent: Container, x: number, y: number): StatsPanel {
    let noArrow = { arrowColor: 'transparent' }
    let panel = new StatsPanel(gStats, noArrow) // a ReadOnly ParamGUI reading gStats [& pstat(color)]
    let sp = "                   " , opts = { }
    panel.makeParamSpec("nStones", [sp], opts)
    panel.makeParamSpec("nInf", [sp], opts)
    panel.makeParamSpec("nAttacks", [sp], opts)
    panel.makeParamSpec("nThreats", [sp], opts)
    panel.makeParamSpec("dMax", [sp], opts)
    panel.makeParamSpec("score", [sp], opts)
    panel.makeParamSpec("sStat", [sp, 1], opts)
    panel.spec("score").onChange = (item: ParamItem) => {
      panel.setNameText(item.fieldName, `score: ${TP.nVictory}`)
      panel.stage.update()
    }

    parent.addChild(panel)
    panel.x = x
    panel.y = y
    panel.makeLines()
    panel.stage.update()
    return panel
  }
  makeParamGUI(table: Table, parent: Container, x: number, y: number) {
    let restart = false 
    const gui = new ParamGUIP(TP, { textAlign: 'right'}, this.gamePlay)
    const schemeAry = TP.schemeNames.map(n => { return { text: n, value: TP[n] } })
    let nHex = (mh: number, nh: number) => { restart && this.restart.call(this, mh, nh) }
    gui.makeParamSpec("log", [-1, 0, 1, 2], { style: { textAlign: 'right' }, target: TP }); TP.log
    gui.makeParamSpec("mHexes", [2, 3, 4, 5, 6, 7, 8, 9, 10]) // TODO: limit nHexes for mH > 4
    gui.makeParamSpec("nHexes", [1, 2, 3, 4, 5, 6])
    gui.makeParamSpec("maxPlys", [1, 2, 3, 4, 5, 6, 7, 8]); TP.maxPlys
    gui.makeParamSpec("maxBreadth", [5, 6, 7, 8, 9, 10]); TP.maxBreadth
    gui.makeParamSpec("nPerDist", [2, 3, 4, 5, 6, 8, 11, 15, 19]); TP.nPerDist
    gui.makeParamSpec("allowSuicide", [true, false]); TP.allowSuicide
    gui.makeParamSpec("colorScheme", schemeAry, { style: { textAlign: 'center' } })
    gui.spec("mHexes").onChange = (item: ParamItem) => { nHex(item.value, TP.nHexes) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { nHex(TP.mHexes, item.value) }
    gui.spec("colorScheme").onChange = (item: ParamItem) => {
      gui.setValue(item, TP)
      let hexMap = table.gamePlay.hexMap as HexMap
      hexMap.initInfluence()
      hexMap.forEachHex((h: Hex2) => h.stone && h.stone.paint())
      table.nextHex.stone?.paint()
      table.hexMap.update()
    }
    parent.addChild(gui)
    gui.x = x // (3*cw+1*ch+6*m) + max(line.width) - (max(choser.width) + 20)
    gui.y = y
    gui.makeLines()
    gui.stage.update()
    restart = true // *after* makeLines has stablilized selectValue
    const gui2 = this.makeParamGUI2(table, parent, x - 250, y)
    return [gui, gui2]
  }
  makeParamGUI2(table: Table, parent: Container, x: number, y: number) {
    let gui = new ParamGUIP(table, { textAlign: 'center' }, this.gamePlay), infName = "inf:sui"
    gui.makeParamSpec(infName, ['1:1', '1:0', '0:1', '0:0'], { name: infName })
    gui.makeParamSpec("pWeight", [1, .99, .97, .95, .9], { target: TP }) ; TP.pWeight
    gui.makeParamSpec("pWorker", [true, false], { target: TP }); TP.pWorker
    gui.makeParamSpec("pPlaner", [true, false], { target: TP, name: "parallel" }); TP.pPlaner
    gui.makeParamSpec("pBoards", [true, false], { target: TP }); TP.pBoards
    gui.makeParamSpec("pMoves",  [true, false], { target: TP }); TP.pMoves
    gui.makeParamSpec("pGCM",    [true, false], { target: TP }); TP.pGCM
    gui.spec("inf:sui").onChange = (item: ParamItem) => {
      let v = item.value as string 
      table.showInf = v.startsWith('1')
      table.showSui = v.endsWith('1')
    }
    let infSpec = gui.spec(infName); table[infSpec.fieldName] = infSpec.choices[0].text
    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines()
    gui.stage.update()
    return gui
  }
}
