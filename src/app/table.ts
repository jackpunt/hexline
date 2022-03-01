import { Stage, EventDispatcher, Container, Shape, Text, DisplayObject } from "createjs-module";
import { F, S, stime, Dragger, DragInfo, KeyBinder, ScaleableContainer } from "@thegraid/createjs-lib"
import { GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { BoardStats, StatsPanel } from "./stats";
import { TP, StoneColor, stoneColors, otherColor, stoneColor0, stoneColor1 } from "./table-params";

type XYWH = {x: number, y: number, w: number, h: number} // like a Rectangle
export class Stone extends Shape {
  static radius: number = 50
  static height: number = Stone.radius*Math.sqrt(3)/2
  color: StoneColor;
  /** put new Stone of color on cont at location of hex */
  constructor(color: StoneColor, radius: number = Stone.height) {
    super()
    this.color = color
    this.graphics.beginFill(color).drawCircle(0, 0, radius-1)
  }
}
/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {

  bStats: BoardStats
  statsPanel: StatsPanel;
  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: Container
  hexMap: HexMap
  roundNumber: number = 0;
  turnNumber: number = 0
  dropStone: Stone   // set when player drops Stone to indicate a Move
  nextHex: Hex = new Hex("grey", Stone.radius, undefined)
  undoCont: Container = new Container()
  undoShape: Shape = new Shape();
  skipShape: Shape = new Shape();
  redoShape: Shape = new Shape(); 
  undoText: Text = new Text('', F.fontSpec(30));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(30));  // length of history stack

  allPlayers: Player[] = [];
  getNumPlayers(): number { return this.allPlayers.length; }
  curPlayerNdx: number = 0;
  curPlayer: Player;
  getPlayer(stone: Stone): Player {
    return this.allPlayers.find(p => p.color == stone.color)
  }

  constructor(stage: Stage) {
    super();
    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    this.nextHex.Aname = "nextHex"
    this.nextHex.scaleX = this.nextHex.scaleY = 2
    this.skipShape.graphics.f("white").dp(0, 0, 30, 4, 0, 45)  
    this.undoShape.graphics.f("red").dp(-50, 0, 60, 3, 0, 180);
    this.redoShape.graphics.f("green").dp(+50, 0, 60, 3, 0, 0); 
    this.undoText.x = -52; this.undoText.textAlign = "center"
    this.redoText.x = 52; this.redoText.textAlign = "center"
    let undoC = this.undoCont
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = -14;
    undoC.addChild(this.redoText); this.redoText.y = -14;
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
  }
  enableHexInspector() {
    let qShape = new Shape()
    qShape.graphics.f("black").dp(0, 0, 20, 6, 0, 0)
    qShape.y = 50
    this.undoCont.addChild(qShape)
    Dragger.makeDragable(qShape, this, 
      (qShape: Shape, ctx: DragInfo) => { 
        let hex = this.hexUnderObj(qShape)
        this.dropTarget = hex
      },
      (qShape: Shape, ctx: DragInfo) => {
        let hex = this.hexUnderObj(qShape)
        qShape.x = 0; qShape.y = 50 // return to regular location
        this.undoCont.addChild(qShape)
        if (!hex) return
        let InfDisp = this.hexMap.infCont.children.filter(obj => obj.x == hex.x && obj.y == hex.y)
        let InfName = InfDisp.map(i => i[S.Aname])
        let info = { hex, stone: hex.stoneColor, InfName }
        info[`Inf[${stoneColor0}]`] = hex.inf[stoneColor0]
        info[`Inf[${stoneColor1}]`] = hex.inf[stoneColor1]
        console.log(hex.Aname, info)
      })
  }
  miniMap: HexMap;
  makeMiniMap(parent: Container, x, y) {
    let cont = new Container(); cont[S.Aname] = 'miniMap'
    let victoryHexMap = new HexMap(Stone.radius, cont)
    let rot = 7, rotC = (30-rot), rotH = (rot - 60)
    if (TP.nHexes == 1) rotC = rotH = 0
    victoryHexMap.makeAllDistricts(TP.mHexes, 1)
    let bgHex = new Shape()
    bgHex.graphics.f(TP.bgColor).dp(0, 0, 50*(2*TP.mHexes-1), 6, 0, 60)
    cont.addChildAt(bgHex, 0)
    cont.x = x; cont.y = y
    cont.rotation = rotC
    victoryHexMap.forEachHex(h => {
      h.distText.visible = h.rcText.visible = false; h.rotation = rotH; h.scaleX = h.scaleY = .985
    })
    parent.addChild(cont)
    this.miniMap = victoryHexMap
  }

  layoutTable() {
    let radius = Stone.radius
    let stage = this.stage
    let isStage = (this.stage instanceof Stage)
    this.scaleCont = this.makeScaleCont(!!this.stage) // scaleCont & background
    let mapCont = new Container();
    mapCont[S.Aname] = "mapCont"
    this.scaleCont.addChild(mapCont)

    this.hexMap = new HexMap(radius, mapCont)
    this.gamePlay.hexMap = this.hexMap          // ;this.markHex00()
    this.hexMap.makeAllDistricts(TP.mHexes, TP.nHexes) // typically: 3,3 or 2,4

    let hexRect = this.hexMap.hexCont.getBounds()
    // background sized for hexMap:
    let high = this.hexMap.height, wide = this.hexMap.width // h=rad*1.5; w=rad*r(3)
    let miny = hexRect.y - high, maxy = hexRect.y + hexRect.height + high
    let minx = hexRect.x - wide, maxx = hexRect.x + hexRect.width + wide
    let bgr: XYWH = { x: 0, y: 0, w: (maxx - minx), h: (maxy - miny) }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = bgr.x + (bgr.w) / 2
    mapCont.y = bgr.y + (bgr.h) / 2

    this.nextHex.x = minx + 2 * wide; this.nextHex.y = miny + 2.0 * high;
    // tweak when hexMap is tiny:
    let nh = TP.nHexes, mh = TP.mHexes
    if (nh == 1 || nh + mh <= 5) { bgr.w += 3*wide; mapCont.x += 3*wide; this.nextHex.x = minx - .87*wide }
    this.undoCont.x = this.nextHex.x
    this.undoCont.y = this.nextHex.y + 100
    this.hexMap.hexCont.addChild(this.nextHex)  // single Hex to hold a Stone to play
    this.hexMap.markCont.addChild(this.undoCont)

    this.setBackground(this.scaleCont, bgr) // bounded by bgr
    let p00 = this.scaleCont.localToLocal(bgr.x, bgr.y, this.hexMap.hexCont) 
    let pbr = this.scaleCont.localToLocal(bgr.x+bgr.w, bgr.y+bgr.h, this.hexMap.hexCont)
    this.hexMap.hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)

    this.makeAllPlayers()
    this.setNextPlayer(0)   // make a placeable Stone for Player[0]
    this.bStats = new BoardStats(this) // AFTER allPlayers are defined so can set pStats
    this.enableHexInspector()
    this.makeMiniMap(this.scaleCont, -(200+TP.mHexes*50), 500+100*TP.mHexes)

    this.on(S.add, this.gamePlay.addStoneEvent, this.gamePlay)[S.Aname] = "addStone"
    this.on(S.remove, this.gamePlay.removeStoneEvent, this.gamePlay)[S.Aname] = "removeStone"
    this.stage.update()
  }
  setNextPlayer(ndx: number = -1, turn?: number, log: boolean = true) {
    if (ndx < 0) ndx = (this.curPlayer.index + 1) % this.allPlayers.length;
    if (ndx != this.curPlayerNdx) this.endCurPlayer(this.curPlayer)
    this.curPlayerNdx = ndx;
    this.turnNumber = turn ? turn : this.turnNumber + 1;
    this.roundNumber = Math.floor((this.turnNumber - 1) / this.allPlayers.length) + 1
    let curPlayer = this.curPlayer = this.allPlayers[ndx], tn = this.turnNumber

    if (log) {
      let lm = this.gamePlay.history[0]
      let prev = !!lm ? lm.toString() : ""
      let capd = lm ? lm.captured : [] //this.gamePlay.lastCaptured 
      let history = this.gamePlay.history
      let board = !!this.hexMap.allStones[0] && history[0].board
      let info = { turn: tn, plyr: curPlayer.name, prev, capd, history, undo: this.gamePlay.undoRecs, board }
      console.log(stime(this, `.setNextPlayer ---------------`), info, '-------------', !!this.stage.canvas);
    }
    this.undoText.text = `${this.gamePlay.undoRecs.length}`
    this.redoText.text = `${this.gamePlay.redoMoves.length}`
    this.putButtonOnPlayer(curPlayer);
  }
  endCurPlayer(player: Player) {
    if (!!this.dropStone) {
      Dragger.stopDragable(this.dropStone) // whereever it landed
      delete this.dropStone 
    }
    let stone: Stone = this.nextHex.stone
    if (!!stone) {
      stone.parent.removeChild(stone)
      this.hexMap.update()
    }
  }
  putButtonOnPlayer(player: Player) {
    this.setStone(new Stone(player.color)) // new Stone for Player

    this.stage.update(); //this.hexMap.update()
    this.curPlayer.makeMove()
  }
  /** set hex.stone & addChild,  */
  setStone(stone: Stone, hex: Hex = this.nextHex) {
    let cont: Container = (hex.map || this.hexMap).stoneCont
    hex.parent.localToLocal(hex.x, hex.y, cont, stone)
    cont.addChild(stone)
    hex.stone = stone
    if (hex !== this.nextHex) {
      hex.map.allStones.push({ Aname: hex.Aname, hex: hex, color: stone.color, })
    } else {
      Dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
    }
  }
  /** clear hex.stone & removeChild */
  clearStone(hex: Hex): Stone {
    let stone = hex.stone
    if (stone) {
      let map = !!hex && !!hex.map ? hex.map : this.hexMap
      map.allStones = map.allStones.filter(hsc => hsc.hex !== hex)
      stone.parent.removeChild(stone)
      hex.stone = undefined
    }
    return stone
  }
  hexUnderObj(dragObj: DisplayObject): Hex {
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.hexCont)
    return this.hexMap.hexUnderPoint(pt.x, pt.y)
  }
  _dropTarget: Hex;
  get dropTarget() { return this._dropTarget}
  set dropTarget(hex: Hex) { this._dropTarget = hex; this.hexMap.showMark(hex)}
  isSuicide: Hex[]
  maybeSuicide: Hex[];
  dragFunc(stone: Stone, ctx: DragInfo): Hex | void {
    if (stone.color !== this.curPlayer.color) return
    if (ctx.first) {
      // ctx.lastCont == stone.parent == hexMap.stoneCont (putButtonOnPlayer & nextStone)
      this.hexMap.showMark(this.nextHex)
      let opc = otherColor(this.curPlayer.color)
      this.isSuicide = []
      this.maybeSuicide = this.hexMap.filterEachHex(hex => hex.isAttack(opc))
      //console.log(stime(this, `.dragStart:${stone.color}`), this.maybeSuicide.map(h => h.Aname))
    } else {
      let hex = this.hexUnderObj(stone)
      if (!hex) return
      if (hex === this.dropTarget) return
      // gamePlay.allowDrop(hex)
      if (!!hex.capMark) return this.dropTarget = this.nextHex
      if (!!hex.stone && hex.stone != stone) return // Ok to drop on itself
      if (this.isSuicide.includes(hex)) {
        return this.dropTarget = this.nextHex
      }
      if (this.maybeSuicide.includes(hex) && this.gamePlay.isSuicide(hex, stone.color)) {
        this.isSuicide.push(hex)
        return this.dropTarget = this.nextHex
      } else this.maybeSuicide = this.maybeSuicide.filter(h => h !== hex)
      this.dropTarget = hex // hex.parent == hexMap.hexCont
    }
  }
  dropFunc(stone: Stone, ctx: DragInfo) {
    // stone.parent == hexMap.stoneCont
    this.dropStone = stone
    let mark = this.hexMap.mark
    stone.x = mark.x
    stone.y = mark.y
    if (this.dropTarget === this.nextHex) return
    this.nextHex.stone = undefined
    this.dispatchEvent(new HexEvent(S.add, this.dropTarget, stone))
  }
  makeAllPlayers() {
    this.allPlayers = []
    this.allPlayers[0] = new Player(this, 0, stoneColors[0])
    this.allPlayers[1] = new Player(this, 1, stoneColors[1])
  }
  otherPlayer(plyr: Player) { return plyr == this.allPlayers[0] ? this.allPlayers[0] : this.allPlayers[1]}
  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }
  // meta-n: 1:1, 2:7, 3:19, 4:37
  
  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  scaleParams = { zscale: .20, initScale: .324, zero: 0.125, max: 30, limit: 4, base: 1.1, min: -2 };

  /** makeScaleableBack and setup scaleParams 
   * @param bindkeys true if there's a GUI/user/keyboard
   */
  makeScaleCont(bindKeys: boolean): ScaleableContainer {
    this.scaleParams.initScale = 0.324; // .125 if full-size cards
    /** scaleCont: a scalable background */
    let scaleC = new ScaleableContainer(this.stage, this.scaleParams);
    if (!!scaleC.stage.canvas) {
      Dragger.makeDragable(scaleC); // THE case where not "dragAsDispObj"
      scaleC.addChild(Dragger.dragCont); // so dragCont is in ScaleableContainer
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      this.bindKeysToScale(scaleC, 800, 10, this.scaleParams.initScale)
      KeyBinder.keyBinder.dispatchChar("a")
    }
    return scaleC
  }
  setBackground(scaleC: Container, bounds: XYWH, bgColor: string = TP.bgColor) {
    if (!!bgColor) {
      // specify an Area that is Dragable (mouse won't hit "empty" space)
      let bgRect = new Shape();
      bgRect.graphics.f(bgColor).r(bounds.x, bounds.y, bounds.w, bounds.h);
      scaleC.addChildAt(bgRect, 0);
      //console.log(stime(this, ".makeScalableBack: background="), background);
    }
  }
  /** 
   * @param xos x-offset-to-center in Original Scale
   * @param xos y-offset-to-center in Original Scale
   * @param scale Original Scale
   */
  // bindKeysToScale(scaleC, 800, 0, scale=.324)
  bindKeysToScale(scaleC: ScaleableContainer, xos: number, yos: number, scale: number) {
    let xoff = scaleC.x, yoff = scaleC.y // generally == 0
    let xosZ = xos, yosZ = yos, scaleZ = scale, nsZ = scaleC.findIndex(scale)
    // set Keybindings to reset Scale:
    let setScaleZ = () => {
      scaleZ = scaleC.getScale()
      nsZ = scaleC.findIndex(scaleZ)
      xosZ = scaleC.x/scaleZ; yosZ = scaleC.y/scaleZ;
    };
    let useScaleZ = () => {
      scaleC.scaleContainer(0, { x: xoff + scale * xosZ, y: yoff + scale * yosZ }); // resetXY
      scaleC.setScaleIndex(nsZ);
      scaleC.stage.update();
    };
    let useScaleA = () => {
      let nsA = .5
      scaleC.scaleContainer(0, { x: xoff + scale * xos, y: yoff + scale * yos }); // resetXY
      scaleC.setScaleIndex(scaleC.findIndex(nsA))
      scaleC.stage.update();
    };
    // Scale-setting keystrokes:
    KeyBinder.keyBinder.globalSetKeyFromChar("x", { thisArg: this, func: setScaleZ });
    KeyBinder.keyBinder.globalSetKeyFromChar("z", { thisArg: this, func: useScaleZ });
    KeyBinder.keyBinder.globalSetKeyFromChar("a", { thisArg: this, func: useScaleA });
  }
}