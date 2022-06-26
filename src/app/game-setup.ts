import { Container, Stage } from "@thegraid/easeljs-module";
import { stime, makeStage, S } from "@thegraid/easeljs-lib";
import { ParamGUI, ParamItem} from '@thegraid/easeljs-lib' // './ParamGUI' //
import { GamePlay } from "./game-play";
import { StatsPanel, TableStats } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";
import { Hex2, HexMap } from "./hex";
import { ParamGUIP } from "./ParamGUIP";
import { HgClient, HgReferee } from "./HgClient";
import { CgClient, CgReferee } from "./CgClient";
import { CgMessage, CgType, CLOSE_CODE, DataBuf } from "@thegraid/wspbclient";
import { HgMessage, HgType } from "src/proto/HgProto";

/** show " R" for " N" */
stime.anno = (obj: string | { constructor: { name: string; }; }) => {
  let stage = obj?.['stage'] || obj?.['table']?.['stage']
  return !!stage ? (!!stage.canvas ? " C" : " R") : " -" as string
}

/** initialize & reset & startup the application. */
export class GameSetup {
  static setup: GameSetup
  stage: Stage;
  gamePlay: GamePlay
  paramGUIs: ParamGUI[]

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
    const gui2 = this.makeParamGUI2(table, parent, x - 280, y)
    const gui3 = this.makeNetworkGUI(table, parent, x, y + gui.ymax + 40 )
    return [gui, gui2, gui3]
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
  defStyle = { rootColor: "rgba(160,160,160,.5)", arrowColor: "grey" }
  makeNetworkGUI (table: Table, parent: Container, x: number, y: number) {
    let gui = new ParamGUI(TP, this.defStyle)
    gui.makeParamSpec("Network", [" ", "yes", "no", "yes+", "ref"], { fontColor: "red" })
    gui.makeParamSpec("PlayerId", [" ", 0, 1, 2, 3], { fontColor: "blue" })

    gui.spec("Network").onChange = (item: ParamItem) => {
      if (item.value == "yes") this.network.call(this, false)  // provoked by nkey; HgClient
      if (item.value == "ref") this.network.call(this, true)   // provoked by rkey; CmReferee
      if (item.value == "no") this.closeNetwork.call(this)     // provoked by ckey
     }
     parent.addChild(gui)
     gui.makeLines()
     gui.x = x; gui.y = y
     parent.stage.update()
    return gui
  }
  hgClient: HgClient
  network(ref: boolean) {
    let nameByClientId = ["Referee", "Alice", "Bob", "Charlie", "Doris"];
    let paramGUI = this.paramGUIs[2]
    let group = TP.networkGroup, url = TP.networkUrl
    // invoked after [a] referee has joined the game
    let join_game_as_player = (ack: CgMessage, hgClient: HgClient) => {
      let client_id = hgClient.client_id // 0 or 1
      let name = nameByClientId[client_id]
      console.log(stime(this, ".network join_game_as_player: start"), { name, client_id, ack })
      // send join_game request to Referee {client_id: 0}; handle the subsequent join message
      let join_ackp = hgClient.sendAndReceive(() => hgClient.send_join(name),
        // predicate: indicating join by player/name 
        (msg) => (msg && msg.type == HgType.join && msg.name == name))
      join_ackp.then(
        // like a 'once' Listener; in addition to cmClient.eval_join:
        (msg: HgMessage) => {
          let player_id = msg.player // use player_id assigned by referee
          console.log(stime(this, ".network join_game_as_player: joined"), { name, player_id, msg })
          if (player_id >= 0) {
            let player = this.gamePlay.allPlayers[player_id]
            paramGUI.selectValue("PlayerId", player_id) // dubious... may need > 1 of these [multi-choice]
            hgClient.player = player                // indicate isNetworked(player); cmClient.localPlayer += player
            this.gamePlay.setNextPlayer(player)  // ndx & putButtonOnPlayer
          }
        }, (reason) => {
          console.warn(stime(this, `.join_game_as_player: join failed:`), reason)
        })
    }
    // onOpen: attach player to this.table & GUI [also for standalone Referee]
    let cgOpen = (hgClient: HgClient) => {
      paramGUI.selectValue("Network", ref ? "ref" : "yes+")
      //hgClient.attachToGUI(this.table)
      hgClient.onclose = (ev: CloseEvent) => {
        paramGUI.selectValue("Network", " ")
        paramGUI.selectValue("PlayerId", " ")
      }
    }
    let initPlyrClient = (url: string, onOpen: (hgClient: HgClient) => void) => {
      // connectStack; then onOpen(hgClient); maybeMakeRef; join_game
      new HgClient(url, (hgClient) => {
        onOpen(hgClient)
        hgClient.wsbase.log = false
        hgClient.cgBase.log = false
        hgClient.log = false
        hgClient.cgBase.send_join(group).then((ack: CgMessage) => {
          console.log(stime(this, `.network CgJoin(${group}) ack:`), 
            { success: ack.success, client_id: ack.client_id, hgCid: hgClient.client_id, hgClient, ack })
          if (!ack.success) return        // did not join Client-Group!
          if (ack.client_id === 0) return // asked for Referee connection and got it!
          // joined ClientGroup with cgBase.client_id; try make a Referee, then join_game as player
          if (ack.cause === "auto-approve") {
            this.makeRefJoinGroup(url, group, ack => join_game_as_player(ack, hgClient))
          } else {
            join_game_as_player(ack, hgClient)
          }
        })
      })
    }
    let initRefClient = (url: string, onOpen: (hgClient: HgClient) => void) => {
      new HgReferee(undefined, (refClient => {
        refClient.wsbase.log = false
        refClient.cgBase.log = false
        refClient.log = false
      })).joinGroup(url, group, onOpen) // explicit refClient
    }
    // client for GUI connection to CmServer:
    (ref ? initRefClient : initPlyrClient)(url, cgOpen)
  }
  closeNetwork() {
    let closeMe = (hgClient: HgClient) => { 
      hgClient.closeStream(CLOSE_CODE.NormalCLosure, "GUI -> no")
    }
    this.isNetworked(closeMe, true)
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
    } else if (this.hgClient.player == this.gamePlay.curPlayer) {
      !!isCurPlayer && isCurPlayer(this.hgClient) // hgClient is running the curPlayer
    } else {
      !!otherPlayer && otherPlayer(this.hgClient) // hgClient is not running curPlayer
    }
    return true   // isNetworked: has an Open HgClient
  }
  
  /** 
   * setup game and table for headless CmReferee in a Player's browser. 
   * @param onJoin inform caller that CmReferee is ready.
   * @returns the CmReferee (like a constructor...)
   */
  makeRefJoinGroup(url: string, group: string, onJoin: (ack: CgMessage) => void): CgReferee<HgMessage> {
    let refgs = new GameSetup(null) // with no Canvas
    refgs.stage.enableMouseOver(0)
    refgs.stage.enableDOMEvents(false)
    refgs.stage.tickEnabled = refgs.stage.tickChildren = false
    refgs.startup(this)           // get all the Cards/Decks from this.table [no ParamGUI]
    let ref = refgs.hgClient = new HgReferee(undefined) // No URL, no connectStack()
    let onOpen = (hgReferee: HgReferee) => {
      hgReferee.wsbase.log = false
      hgReferee.cgBase.log = false
      console.log(stime(hgReferee, `.onOpen: now join_game_as_player(0)`))
    }
    return ref.joinGroup(url, group, onOpen, onJoin);
  }
}
