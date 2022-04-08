import { Container, Stage } from "createjs-module";
import { C, Obj, DropdownButton, ParamGUI, ParamItem, ParamOpts, ParamSpec, stime, makeStage } from "@thegraid/createjs-lib";
import { GamePlay } from "./game-play";
import { StatsPanel, TableStats } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";

/** initialize & reset & startup the application. */
export class GameSetup {

  stage: Stage;

  /** @param canvasId supply undefined for 'headless' Stage */
  constructor(canvasId: string) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    this.stage = makeStage(canvasId, false)
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

    table.layoutTable(gamePlay)           // mutual injection, all the GUI components, fill hexMap
    table.statsPanel = this.makeStatsPanel(gamePlay.gStats, table.scaleCont, -300, 50)
    this.makeParamGUI(table.scaleCont, -300, 370) // modify TP.params...
  }
  makeStatsPanel(gStats: TableStats, parent: Container, x, y): StatsPanel {
    let panel = new StatsPanel(gStats) // a ReadOnly ParamGUI reading gStats [& pstat(color)]
    let specs: ParamSpec[] = [], sp = "                    "
    let spec = (fieldName: string) => { return specs.find(s => s.fieldName == fieldName) }
    specs.push(this.makeParamSpec("nStones", [sp]))
    specs.push(this.makeParamSpec("nInf", [sp]))
    specs.push(this.makeParamSpec("nAttacks", [sp]))
    specs.push(this.makeParamSpec("nThreats", [sp]))
    specs.push(this.makeParamSpec("dMax", [sp]))
    specs.push(this.makeParamSpec("score", [sp]))
    specs.push(this.makeParamSpec("sStat", [sp]))
    //specs.push(this.makeParamSpec("dStones", []))
    //specs.push(this.makeParamSpec("dMinControl", []))
    spec("score").onChange = (item: ParamItem) => {
      panel.setNameText(item.fieldName, `score: ${TP.nVictory}`)
      panel.stage.update()
    }

    parent.addChild(panel)
    panel.x = x
    panel.y = y
    panel.makeLines(specs)
    panel.stage.update()
    return panel
  }
  makeParamGUI(parent: Container, x, y): ParamGUI {
    let gui = new ParamGUI(TP), enable = false
    let specs: ParamSpec[] = []
    let spec = (fieldName: string) => { return specs.find(s => s.fieldName == fieldName) }
    specs.push(this.makeParamSpec("Start", [" ", "yes", "no"], { fontSize: 40, fontColor: "red" }))
    specs.push(this.makeParamSpec("mHexes", [2, 3, 4]))
    specs.push(this.makeParamSpec("nHexes", [1, 2, 3, 4, 5, 6]))
    specs.push(this.makeParamSpec("moveDwell", [300, 600]))
    specs.push(this.makeParamSpec("colorScheme", ['Black_White   ', 'Blue_Red  ']))
    spec("Start").onChange = (item: ParamItem) => { if (item.value == "yes") this.restart.call(this) }
    spec("nHexes").onChange = (item: ParamItem) => {
      TP.fnHexes(item.value, TP.mHexes)
      enable && gui.selectValue("Start", "yes")
    }
    spec("mHexes").onChange = (item: ParamItem) => {
      TP.fnHexes(TP.nHexes, item.value)
      enable && gui.selectValue("Start", "yes")
    }
    spec("colorScheme").onChange = (item: ParamItem) => {
      //enable && gui.selectValue("colorScheme", TP[item.value])
      TP[item.fieldName] = TP[item.value.trim()] // override setValue
      let table = this.stage['table'] as Table
      table.gamePlay.hexMap.initInfluence(true)
      table.nextHex.stone.paint()
    }
    parent.addChild(gui)
    gui.x = x // (3*cw+1*ch+6*m) + max(line.width) - (max(choser.width) + 20)
    gui.y = y
    gui.makeLines(specs)
    gui.stage.update()
    enable = true // *after makeLines has stablilized selectValue
    return gui
  }
  makeParamSpec(fieldName: string, ary: any[], opts: ParamOpts = { fontSize: 32, fontColor: C.black }): ParamSpec {
    let { fontSize, fontColor, onChange } = opts
    let choices = this.makeChoiceItems(fieldName, ary) // [{text, fieldname, value}]
    let style = Obj.fromEntriesOf(DropdownButton.defaultStyle)
    style.rootColor = "rgba(160,160,160,.5)"
    style.arrowColor = "grey"
    Object.entries(opts).forEach(([key, val]) => style[key] = val)
    return { fieldName, choices, fontSize, fontColor, style, onChange }
  }
  makeChoiceItems(fieldName: string, ary: any[]): ParamItem[] {
    return ary.map(elt => {
      let text = elt.toString()
      if (typeof (elt) == "function") text = elt.name  // className(elt) => "Function" !?
      //if (fieldName.startsWith("Robo")) console.log(stime(this, ".makeChoiceItem"), {fieldName, text})
      return { text, fieldName, value: elt }
    })
  }
}
