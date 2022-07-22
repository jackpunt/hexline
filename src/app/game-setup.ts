import { DropdownChoice, DropdownItem, DropdownStyle, makeStage, ParamGUI, ParamItem, S, stime } from "@thegraid/easeljs-lib";
import { Container, Stage } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex2, HexMap } from "./hex";
import { ParamGUIP } from "./ParamGUIP";
import { StatsPanel, TableStats } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";

/** show " R" for " N" */
stime.anno = (obj: string | { constructor: { name: string; }; }) => {
  let stage = obj?.['stage'] || obj?.['table']?.['stage']
  return !!stage ? (!!stage.canvas ? " C" : " R") : " -" as string
}

/** initialize & reset & startup the application. */
export class GameSetup {
  stage: Stage;
  gamePlay: GamePlay
  paramGUIs: ParamGUI[]
  netGUI: ParamGUI

  /** @param canvasId supply undefined for 'headless' Stage */
  constructor(canvasId: string, ext?: string[]) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    this.stage = makeStage(canvasId, false)
    if (!this.stage.canvas) {
      this.stage.enableMouseOver(0)
      this.stage.enableDOMEvents(false)
      this.stage.tickEnabled = this.stage.tickChildren = false
    }
    this.startup(ext)
  }
  _netState = " " // or "yes" or "ref"
  set netState(val: string) { 
    this._netState = (val == "cnx") ? "yes" : val
    this.gamePlay.ll(2) && console.log(stime(this, `.netState('${val}')->'${this._netState}'`))
    this.netGUI?.selectValue("Network", val)
  }
  get netState() { return this._netState }
  set playerId(val: string) { this.netGUI?.selectValue("PlayerId", val) }

  /** C-s ==> kill game, start a new one, possibly with new (mh,nh) */
  restart(mh = TP.mHexes, nh= TP.nHexes) {
    let netState = this.netState
    this.gamePlay.closeNetwork('restart')
    this.gamePlay.logWriter?.closeFile()
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
    let rv = this.startup()
    this.netState = " "      // onChange->noop
    // onChange-> ("yes" OR "ref") initiate a new connection
    setTimeout(() => this.netState = netState, 100)
    return rv
  }
  /**
   * Make new Table/layout & gamePlay/hexMap & Players. 
   * @param ext Extensions from URL
   */
  startup(ext: string[] = []) {
    let table = new Table(this.stage) // EventDispatcher, ScaleCont, GUI-Player
    let gamePlay = new GamePlay(table, this) // hexMap, players, gStats, mouse/keyboard->GamePlay
    this.gamePlay = gamePlay
    gamePlay.hexMap[S.Aname] = `mainMap`
    let statsx = -300, statsy = 30
    table.layoutTable(gamePlay)           // mutual injection, all the GUI components, fill hexMap
    gamePlay.forEachPlayer(p => p.newGame(gamePlay))        // make Planner *after* table & gamePlay are setup
    if (this.stage.canvas) {
      let statsPanel = this.makeStatsPanel(gamePlay.gStats, table.scaleCont, statsx, statsy)
      table.statsPanel = statsPanel
      let guiy = statsPanel.y + statsPanel.ymax + statsPanel.lead * 2
      console.groupCollapsed('initParamGUI')
      this.paramGUIs = this.makeParamGUI(table, table.scaleCont, statsx, guiy) // modify TP.params...
      let [gui, gui2] = this.paramGUIs
      table.miniMap.mapCont.y = Math.max(gui.ymax, gui2.ymax) + gui.y + table.miniMap.wh.height / 2
      console.groupEnd()
    }
    table.startGame() // setNextPlayer()
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
    let restart = false, infName = "inf:sui"
    const gui = new ParamGUIP(TP, { textAlign: 'right'}, this.gamePlay)
    const schemeAry = TP.schemeNames.map(n => { return { text: n, value: TP[n] } })
    let mHex = (mh: number, nh: number) => { restart && this.restart.call(this, mh, nh) }
    let nHex = (mh: number, nh: number) => { restart && this.restart.call(this, nh>3?Math.min(mh,3):nh>1?Math.min(mh,4):mh, nh) }
    gui.makeParamSpec("mHexes", [2, 3, 4, 5, 6, 7, 8, 9, 10], { fontColor: "green" }) // TODO: limit nHexes for mH > 4
    gui.makeParamSpec("nHexes", [1, 2, 3, 4, 5, 6], { fontColor: "green" })
    gui.makeParamSpec(infName, ['1:1', '1:0', '0:1', '0:0'], { name: infName, target: table, fontColor: 'green' })
    gui.makeParamSpec("maxPlys", [1, 2, 3, 4, 5, 6, 7, 8], { fontColor: "blue" }); TP.maxPlys
    gui.makeParamSpec("maxBreadth", [5, 6, 7, 8, 9, 10], { fontColor: "blue" }); TP.maxBreadth
    gui.makeParamSpec("nPerDist", [2, 3, 4, 5, 6, 8, 11, 15, 19], { fontColor: "blue" }); TP.nPerDist
    gui.makeParamSpec("allowSuicide", [true, false]); TP.allowSuicide
    gui.makeParamSpec("colorScheme", schemeAry, { style: { textAlign: 'center' } })
    let infSpec = gui.spec(infName); table[infSpec.fieldName] = infSpec.choices[0].text
    infSpec.onChange = (item: ParamItem) => {
      let v = item.value as string 
      table.showInf = v.startsWith('1')
      table.showSui = v.endsWith('1')
    }
    gui.spec("mHexes").onChange = (item: ParamItem) => { mHex(item.value, TP.nHexes) }
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
    const gui2 = this.makeParamGUI2(table, parent, x - 280, y)
    const gui3 = this.makeNetworkGUI(table, parent, x - 300, y + gui.ymax + 20 )
    gui.parent.addChild(gui) // bring to top
    gui.stage.update()
    restart = true // *after* makeLines has stablilized selectValue
    return [gui, gui2, gui3]
  }
  makeParamGUI2(table: Table, parent: Container, x: number, y: number) {
    let gui = new ParamGUIP(TP, { textAlign: 'center' }, this.gamePlay)
    gui.makeParamSpec("log", [-1, 0, 1, 2], { style: { textAlign: 'right' } }); TP.log
    gui.makeParamSpec("pWeight", [1, .99, .97, .95, .9]) ; TP.pWeight
    gui.makeParamSpec("pWorker", [true, false], { chooser: TF }); TP.pWorker
    gui.makeParamSpec("pPlaner", [true, false], { chooser: TF, name: "parallel" }); TP.pPlaner
    gui.makeParamSpec("pBoards", [true, false], { chooser: TF }); TP.pBoards
    gui.makeParamSpec("pMoves",  [true, false], { chooser: TF }); TP.pMoves
    gui.makeParamSpec("pGCM",    [true, false], { chooser: TF }); TP.pGCM
    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines()
    gui.stage.update()
    return gui
  }
  defStyle: DropdownStyle = { rootColor: "rgba(160,160,160,.5)", arrowColor: "grey", textAlign: 'right' };
  makeNetworkGUI (table: Table, parent: Container, x: number, y: number) {
    let gui = this.netGUI = new ParamGUI(TP, this.defStyle)
    gui.makeParamSpec("Network", [" ", "yes", "no", "ref", "cnx"], { fontColor: "red" })
    gui.makeParamSpec("PlayerId", [" ", 0, 1, 2, 3, "ref"], { fontColor: "red" })

    gui.spec("Network").onChange = (item: ParamItem) => {
      if (item.value == "yes") this.gamePlay.network.call(this.gamePlay, false, gui)  // provoked by nkey; HgClient
      if (item.value == "ref") this.gamePlay.network.call(this.gamePlay, true, gui)   // provoked by rkey; HgReferee
      if (item.value == "no") this.gamePlay.closeNetwork.call(this.gamePlay)     // provoked by ckey
    }
    parent.addChild(gui)
    gui.makeLines()
    gui.x = x; gui.y = y
    parent.stage.update()
    return gui
  }

}

class TF extends DropdownChoice {
  _bool: boolean
  constructor(items: DropdownItem[], item_w: number, item_h: number, style?: DropdownStyle) {
    super(items, item_w, item_h, style)
    let _rootclick = () => { 
      this._bool = !this._bool
      this._index = -1
      let item = this.items[this._bool ? 0 : 1];  // [true, false]
      this.select(item); 
      this.dropdown(false)
    };
    this._rootButton.click(_rootclick)
  }
}
