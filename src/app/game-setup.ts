import { Container, Stage } from "createjs-module";
import { C, Obj, stime, makeStage } from "@thegraid/createjs-lib";
import { DropdownButton, ParamGUI, ParamItem, ParamOpts, ParamSpec,} from '@thegraid/createjs-lib'
import { GamePlay } from "./game-play";
import { StatsPanel, TableStats } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";

/** initialize & reset & startup the application. */
export class GameSetup {
  static setup: GameSetup
  stage: Stage;

  /** @param canvasId supply undefined for 'headless' Stage */
  constructor(canvasId: string) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    this.stage = makeStage(canvasId, false)
    GameSetup.setup = this
  }
  restart() {
    let deContainer = (cont: Container) => {
      cont.children.forEach(dObj => {
        dObj.removeAllEventListeners()
        if (dObj instanceof Container) deContainer(dObj)
      })
      cont.removeAllChildren()
    }
    deContainer(this.stage)
    this.startup()
  }
  /**
   * 
   * @param gs generally *this* GameSetup
   * @param ext Extensions from URL
   */
  startup(gs: GameSetup = this, ext: string[] = []) {
    let table = new Table(this.stage) // EventDispatcher, ScaleCont
    let gamePlay = new GamePlay(table) // hexMap, players, gStats, mouse/keyboard->GamePlay
    let statsx = -300, statsy = 30
    table.layoutTable(gamePlay)           // mutual injection, all the GUI components, fill hexMap
    let statsPanel = this.makeStatsPanel(gamePlay.gStats, table.scaleCont, statsx, statsy)
    table.statsPanel = statsPanel
    let last = statsPanel.lines[statsPanel.lines.length-1]
    let guiy = statsPanel.y + last.y + last.height + statsPanel.lead * 2  
    this.makeParamGUI(table, table.scaleCont, statsx, guiy) // modify TP.params...
  }
  makeStatsPanel(gStats: TableStats, parent: Container, x, y): StatsPanel {
    let noArrow = { arrowColor: 'rgba(0,0,0,0)' }
    let panel = new StatsPanel(gStats, noArrow) // a ReadOnly ParamGUI reading gStats [& pstat(color)]
    let sp = "                   " , opts = { }
    panel.makeParamSpec("nStones", [sp], opts)
    panel.makeParamSpec("nInf", [sp], opts)
    panel.makeParamSpec("nAttacks", [sp], opts)
    panel.makeParamSpec("nThreats", [sp], opts)
    panel.makeParamSpec("dMax", [sp], opts)
    panel.makeParamSpec("score", [sp], opts)
    panel.makeParamSpec("sStat", [sp], opts)
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
  makeParamGUI(table: Table, parent: Container, x, y): ParamGUI {
    let gui = new ParamGUI(TP)
    let enable = false, nHex = (nH, mH) => { TP.fnHexes(nH, mH); enable && gui.selectValue("Start", "yes") }
    gui.makeParamSpec("Start", [" ", "yes", "no"], { fontSize: 40, fontColor: "red" })
    gui.makeParamSpec("mHexes", [2, 3, 4])
    gui.makeParamSpec("nHexes", [1, 2, 3, 4, 5, 6])
    gui.makeParamSpec("nPlys", [1, 2, 3, 4, 5, 6, 7, 8])
    //gui.makeParamSpec("moveDwell", [300, 600])
    gui.makeParamSpec("colorScheme", ['Black_White   ', '  Blue_Red  '])
    gui.spec("Start").onChange = (item: ParamItem) => { if (item.value == "yes") this.restart.call(this) }
    gui.spec("mHexes").onChange = (item: ParamItem) => { nHex(TP.nHexes, item.value) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { nHex(item.value, TP.mHexes) }
    gui.spec("colorScheme").onChange = (item: ParamItem) => {
      TP[item.fieldName] = TP[item.value.trim()] // overwrite setValue
      table.gamePlay.hexMap.initInfluence(true)
      table.nextHex.stone.paint()
    }
    parent.addChild(gui)
    gui.x = x // (3*cw+1*ch+6*m) + max(line.width) - (max(choser.width) + 20)
    gui.y = y
    gui.makeLines()
    gui.stage.update()
    enable = true // *after* makeLines has stablilized selectValue
    return gui
  }
}
