import { BoolChoice, CycleChoice, DropdownButton, DropdownChoice, DropdownItem, DropdownStyle, makeStage, ParamGUI, ParamItem, ParamLine, ParamType, S, stime } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Stage } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex2, HexMap } from "./hex";
import { ParamGUIP } from "./ParamGUIP";
import { StatsPanel, TableStats } from "./stats";
import { Stone, Table } from "./table";
import { stoneColors, TP } from "./table-params";

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
  netGUI: ParamGUI // paramGUIs[2]

  /** @param canvasId supply undefined for 'headless' Stage */
  constructor(canvasId: string, ext?: string[]) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    this.stage = makeStage(canvasId, false)
    this.startup(ext)
  }
  _netState = " " // or "yes" or "ref"
  set netState(val: string) { 
    this._netState = (val == "cnx") ? this._netState : val || " "
    this.gamePlay.ll(2) && console.log(stime(this, `.netState('${val}')->'${this._netState}'`))
    this.netGUI?.selectValue("Network", val)
  }
  get netState() { return this._netState }
  set playerId(val: string) { this.netGUI?.selectValue("PlayerId", val || "     ") }

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
    this.netState = " "      // onChange->noop; change to new/join/ref will trigger onChange(val)
    // next tick, new thread...
    setTimeout(() => this.netState = netState, 100) // onChange-> ("new", "join", "ref") initiate a new connection
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
    let panel = new StatsPanel(gStats) // a ReadOnly ParamGUI reading gStats [& pstat(color)]
    panel.makeParamSpec("nStones")     // implicit: opts = { chooser: StatChoice }
    panel.makeParamSpec("nInf")
    panel.makeParamSpec("nAttacks")
    panel.makeParamSpec("nThreats")
    panel.makeParamSpec("dMax")
    panel.makeParamSpec("score")
    panel.makeParamSpec("sStat", [1])
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
    let restart = false, infName = "inf:sac"
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
    gui.makeParamSpec("allowSacrifice", [true, false], { chooser: BC }); TP.allowSacrifice
    gui.makeParamSpec("colorScheme", schemeAry, { chooser: CycleChoice, style: { textAlign: 'center' } })
    let infSpec = gui.spec(infName); table[infSpec.fieldName] = infSpec.choices[0].text
    infSpec.onChange = (item: ParamItem) => {
      let v = item.value as string 
      table.showInf = v.startsWith('1')
      table.showSac = v.endsWith('1')
    }
    gui.spec("mHexes").onChange = (item: ParamItem) => { mHex(item.value, TP.nHexes) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { nHex(TP.mHexes, item.value) }
    gui.spec("colorScheme").onChange = (item: ParamItem) => {
      gui.setValue(item, TP)
      let hexMap = table.gamePlay.hexMap as HexMap
      hexMap.initInfluence()
      hexMap.forEachHex((h: Hex2) => h.stone && h.stone.paint())
      table.nextHex.stone?.paint() // TODO: also paint buttons on undoPanel
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
    gui.makeParamSpec("pWorker", [true, false], { chooser: BC }); TP.pWorker
    gui.makeParamSpec("pPlaner", [true, false], { chooser: BC, name: "parallel" }); TP.pPlaner
    gui.makeParamSpec("pBoards", [true, false], { chooser: BC }); TP.pBoards
    gui.makeParamSpec("pMoves",  [true, false], { chooser: BC }); TP.pMoves
    gui.makeParamSpec("pGCM",    [true, false], { chooser: BC }); TP.pGCM
    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines()
    gui.stage.update()
    return gui
  }
  netColor: string = "rgba(160,160,160, .8)" 
  netStyle: DropdownStyle = { textAlign: 'right' };
  makeNetworkGUI (table: Table, parent: Container, x: number, y: number) {
    let gui = this.netGUI = new ParamGUIL(TP, this.netStyle)
    gui.makeParamSpec("Network", [" ", "new", "join", "no", "ref", "cnx"], { fontColor: "red" })
    gui.makeParamSpec("PlayerId", ["     ", 0, 1, 2, 3, "ref"], { chooser: PidChoice, fontColor: "red" })
    //gui.makeParamSpec("networkGroup", [TP.networkGroup], { chooser: NC, name: 'gid' }) ; TP.networkGroup

    gui.spec("Network").onChange = (item: ParamItem) => {
      if (['new', 'join', 'ref'].includes(item.value)) {
        this.gamePlay.closeNetwork()
        this.gamePlay.network(item.value, gui)
      }
      if (item.value == "no") this.gamePlay.closeNetwork()     // provoked by ckey
    }
    this.netGUI = gui
    this.showNetworkGroup()
    parent.addChild(gui)
    gui.makeLines()
    gui.x = x; gui.y = y
    parent.stage.update()
    return gui
  }
  showNetworkGroup(group_name = TP.networkGroup) {
    document.getElementById('group_name').innerText = group_name
  }
}

interface DDCx extends DropdownChoice {
  /**
   * 
   * @param value the new value to be set
   * @param item included for those that need item.fieldName or such
   * @param target the associated object to which fieldName applies
   */
  setValue(value: ParamType, item: ParamItem, target: object): void
}

/** delegate setValue() to per-line choser; ? vs onChange()? */
class ParamGUIL extends ParamGUI {
  /** 
   * setValue() is called when item gets selected; the default 'onChange(item)' 
   * 
   * delegate to per-line chooser.setValue() if it is defined. [ex: PidChoice]
   */
  override setValue(item: ParamItem, target?: object): void {
    let line = this.findLine(item.fieldName)
    let chooser = line.chooser as DDCx
    let lineSetter = chooser.setValue
    if (typeof lineSetter == 'function') { 
      chooser.setValue(item.value, item, target)
      return 
    }
    super.setValue(item, target)
  }

  /** GamePlay.network invokes when joining a group, setting group_name string 
   * @param value might have been item.value
   */
  override selectValue(fieldName: string, value: any, line = this.findLine(fieldName)): ParamItem {
    let item = super.selectValue(fieldName, value, line)
    if (item) return item
    // item with matching value not found... use item[0] presumed to be mutable
    item = line.spec.choices[0]
    //this.setValue(item, line.spec.target)
    let chooser = line.chooser as DDCx
    if (typeof chooser.setValue == 'function') {
      chooser.setValue(value, item, line.spec.target)
    }
    return item;    
  }
}

/** no choice: a DropdownChoice with 1 mutable item that can be set by setValue(...) */
class NC extends DropdownChoice implements DDCx {
  static style(defStyle: DropdownStyle) {
    let baseStyle = DropdownButton.mergeStyle(defStyle)
    let pidStyle = { arrowColor: 'transparent', textAlign: 'right' }
    return DropdownButton.mergeStyle(pidStyle, baseStyle)
  }
  constructor(items: DropdownItem[], item_w: number, item_h: number, defStyle?: DropdownStyle) {
    super(items, item_w, item_h, NC.style(defStyle))
  }
  /** never expand */
  override rootclick(): void {}

  setValue(value: string, item: ParamItem, target: object): void {
    item.value = value // for reference?
    this._rootButton.text.text = value
  }

  // TODO: selectValue() to write the root_item text
}
/** like StatsPanel: read-only output field */
class PidChoice extends NC implements DDCx {
  readonly playerStone: Stone = new Stone()
  paintStone(pid: number) {
    let stone = this.playerStone
    stone.paint(stoneColors[pid])
    stone.visible = true
    if (!stone.parent) {
      let line = this.parent as ParamLine
      stone.scaleX = stone.scaleY = (line.height-2)/Stone.height/2
      stone.x = stone.scaleY * Stone.height + 1
      stone.y = line.height / 2
      this.addChild(stone)
    }
  }
  override setValue(value: any, item: ParamItem, target: object) {
    //target[item.fieldName] = item.value
    this.paintStone(item.value) // do NOT set any fieldName/value
  }
}

/** present [false, true] with any pair of string: ['false', 'true'] */
class BC extends BoolChoice {}
