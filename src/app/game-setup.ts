import { Container, Stage } from "createjs-module";
import { C, Obj, DropdownButton, ParamGUI, ParamItem, ParamOpts, ParamSpec, stime, makeStage } from "@thegraid/common-lib";
import { GamePlay } from "./game-play";
import { StatsPanel } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";

/** initialize & reset & startup the application. */
export class GameSetup {

  stage: Stage;
  table: Table;
  gamePlay: GamePlay;
  paramGui: ParamGUI;

  /** @param canvasId supply undefined for 'headless' Stage */
  constructor(canvasId: string) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    //this.stage = new Stage(canvasId); 
    let stage = this.stage = makeStage(canvasId, false)
    this.table = new Table(stage)      // makeScaleCont()
    this.gamePlay = new GamePlay(this.table)
    this.table.gamePlay = this.gamePlay
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
    this.table = new Table(this.stage)
    this.gamePlay = new GamePlay(this.table)
    this.table.gamePlay = this.gamePlay
    this.startup()
  }
  /**
   * 
   * @param gs generally *this* GameSetup
   * @param ext Extensions from URL
   */
  startup(gs: GameSetup = this, ext: string[] = []) {
    this.table.layoutTable()
    this.table.statsPanel = this.makeStatsPanel(this.table.scaleCont, -300, 50)
    this.paramGui = this.makeParamGUI(this.table.scaleCont)
  }
  makeStatsPanel(parent: Container, x, y): StatsPanel {
    let panel = new StatsPanel(this.table.bStats)
    let specs: ParamSpec[] = [], sp = "                    "
    let spec = (fieldName: string) => { return specs.find(s => s.fieldName == fieldName) }
    specs.push(this.makeParamSpec("nStones", [sp]))
    specs.push(this.makeParamSpec("nInf", [sp]))
    specs.push(this.makeParamSpec("nAttacks", [sp]))
    specs.push(this.makeParamSpec("nThreats", [sp]))
    specs.push(this.makeParamSpec("score", [sp]))
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
  makeParamGUI(parent: Container): ParamGUI {
    let specs: ParamSpec[] = []
    let spec = (fieldName: string) => { return specs.find(s => s.fieldName == fieldName) }
    specs.push(this.makeParamSpec("Start", [" ", "yes", "no"], { fontSize: 40, fontColor: "red" }))
    specs.push(this.makeParamSpec("mHexes", [2, 3, 4]))
    specs.push(this.makeParamSpec("nHexes", [1, 2, 3, 4, 5, 6]))
    specs.push(this.makeParamSpec("moveDwell", [300, 600]))
    spec("Start").onChange = (item: ParamItem) => { if (item.value == "yes") this.restart.call(this) }
    spec("nHexes").onChange = (item: ParamItem) => {
      TP.fnHexes(item.value, TP.mHexes)
      !!this.paramGui && this.paramGui.selectValue("Start", "yes")
    }
    spec("mHexes").onChange = (item: ParamItem) => {
      TP.fnHexes(TP.nHexes, item.value)
      !!this.paramGui && this.paramGui.selectValue("Start", "yes")
    }
    let gui = new ParamGUI(TP)

    parent.addChild(gui)
    gui.x = -300 // (3*cw+1*ch+6*m) + max(line.width) - (max(choser.width) + 20)
    gui.y = 350
    gui.makeLines(specs)
    gui.stage.update()
    return gui
  }
  makeParamSpec(fieldName: string, ary: any[], opts: ParamOpts = { fontSize: 32, fontColor: C.black }): ParamSpec {
    let { fontSize, fontColor, onChange } = opts
    let choices = this.makeChoiceItems(fieldName, ary)
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
