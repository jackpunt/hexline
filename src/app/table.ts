import { Stage, EventDispatcher, Container, Shape, Text, DisplayObject, MouseEvent } from "createjs-module";
import { F, S, stime, Dragger, DragInfo, KeyBinder, ScaleableContainer, XY, C } from "@thegraid/createjs-lib"
import { GamePlay, Player } from "./game-play";
import { Hex, Hex2, HexMap, } from "./hex";
import { HexEvent } from "./hex-event";
import { StatsPanel } from "./stats";
import { TP, StoneColor, otherColor, stoneColor0, stoneColor1 } from "./table-params";

type XYWH = {x: number, y: number, w: number, h: number} // like a Rectangle
type HEX_STATUS = { found: boolean, sui: boolean, caps: Hex[] }
const S_stagemousemove = 'stagemousemove'

/**
 * Graphical representation of the 'color' of a Move onto the HexMap.
 * 
 * can be repainted temporarily by 'shift', but that does not change the underlying color.
 */
export class Stone extends Shape {
  static radius: number = TP.hexRad
  static height: number = Stone.radius*Math.sqrt(3)/2
  get radius() { return Stone.height -1 }
  readonly color: StoneColor;

  /** Stone is a Shape with a StoneColor */
  constructor(color: StoneColor) {
    super()
    this.color = color
    this.paint(color)
  }
  paint(color = this.color) {
    this.paint1(TP.colorScheme[color])
  }
  paint2(color: string) {
    this.paint1(color)
    this.graphics.c().f(C.BLACK).dc(0, 0, this.radius/2) // put a hole in it!
    this.updateCache("destination-out")
  }
  paint1(color: string) {
    let rad = this.radius
    this.graphics.c().f(color).dc(0, 0, rad)
    this.cache(-rad, -rad, 2*rad, 2*rad)
  }
}
/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {

  statsPanel: StatsPanel;
  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: Container
  bgRect: Shape
  hexMap: HexMap; // from gamePlay.hexMap
  nextHex: Hex2;
  undoCont: Container = new Container()
  undoShape: Shape = new Shape();
  skipShape: Shape = new Shape();
  redoShape: Shape = new Shape(); 
  undoText: Text = new Text('', F.fontSpec(30));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(30));  // length of history stack
  winText: Text = new Text('', F.fontSpec(40), 'lightgrey')

  dragger: Dragger

  constructor(stage: Stage) {
    super();

    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    this.scaleCont = this.makeScaleCont(!!this.stage) // scaleCont & background
  }
  setupUndoButtons(xOffs, bSize, skipRad, bgr: XYWH) {
    this.skipShape.graphics.f("white").dp(0, 0, 40, 4, 0, skipRad)  
    this.undoShape.graphics.f("red").dp(-xOffs, 0, bSize, 3, 0, 180);
    this.redoShape.graphics.f("green").dp(+xOffs, 0, bSize, 3, 0, 0); 
    this.undoText.x = -52; this.undoText.textAlign = "center"
    this.redoText.x = 52; this.redoText.textAlign = "center"
    this.winText.x = 0; this.winText.textAlign = "center"
    let undoC = this.undoCont
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = -14;
    undoC.addChild(this.redoText); this.redoText.y = -14;
    undoC.addChild(this.winText);
    this.bgRect.parent.localToLocal(bgr.w/2, 30, undoC, this.winText)
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
    this.enableHexInspector(52)
  }
  enableHexInspector(qY: number) {
    let qShape = new Shape(), toggle = true
    qShape.graphics.f("black").dp(0, 0, 20, 6, 0, 0)
    qShape.y = qY  // size of skip Triangles
    this.undoCont.addChild(qShape)
    this.dragger.makeDragable(qShape, this, 
      // dragFunc:
      (qShape: Shape, ctx: DragInfo) => { 
        let hex = this.hexUnderObj(qShape)
        this.dropTarget = hex
      },
      // dropFunc:
      (qShape: Shape, ctx: DragInfo) => {
        toggle = false
        let hex = this.hexUnderObj(qShape)
        qShape.x = 0; qShape.y = qY // return to regular location
        this.undoCont.addChild(qShape)
        if (!hex) return
        let InfDisp = this.hexMap.infCont.children.filter(obj => obj.x == hex.x && obj.y == hex.y)
        let InfName = InfDisp.map(i => i[S.Aname])
        let info = { hex, stone: hex.stoneColor, InfName }
        info[`Inf[${stoneColor0}]`] = hex.inf[stoneColor0]
        info[`Inf[${stoneColor1}]`] = hex.inf[stoneColor1]
        console.log(hex.Aname, info)
      })
    let toggleText = (evt: MouseEvent, vis?: boolean) => { 
      if (!toggle) return (toggle = true, undefined) // skip one 'click' when pressup/dropfunc
      this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis)); this.hexMap.update() 
      this.hexMap.hexCont.updateCache()
      this.hexMap.update()
    }
    qShape.on(S.click, toggleText, this) // toggle visible
  }
  miniMap: HexMap;
  makeMiniMap(parent: Container, x, y) {
    let cont = new Container(); cont[S.Aname] = 'miniMap'
    let miniMap = this.miniMap = new HexMap(Stone.radius, cont)
    let rot = 7, rotC = (30-rot), rotH = (rot - 60)
    if (TP.nHexes == 1) rotC = rotH = 0
    miniMap.makeAllDistricts(TP.mHexes, 1)
    let bgHex = new Shape()
    bgHex.graphics.f(TP.bgColor).dp(0, 0, TP.hexRad*(2*TP.mHexes-1), 6, 0, 60)
    cont.addChildAt(bgHex, 0)
    cont.x = x; cont.y = y
    cont.rotation = rotC
    miniMap.forEachHex<Hex2>(h => {
      h.distText.visible = h.rcText.visible = false; 
      h.cont.rotation = rotH; h.cont.scaleX = h.cont.scaleY = .985
    })
    parent.addChild(cont)
  }

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    this.hexMap = gamePlay.hexMap

    let mapCont = new Container();
    mapCont[S.Aname] = "mapCont"
    this.scaleCont.addChild(mapCont)

    this.hexMap.addToCont(mapCont).initInfluence()
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

    this.nextHex = new Hex2("grey", Stone.radius, this.hexMap).setName('nextHex')
    this.nextHex.cont.scaleX = this.nextHex.cont.scaleY = 2
    this.nextHex.x = minx + 2 * wide; this.nextHex.y = miny + 2.0 * high;
    // tweak when hexMap is tiny:
    let nh = TP.nHexes, mh = TP.mHexes
    if (nh == 1 || nh + mh <= 5) { bgr.w += 3*wide; mapCont.x += 3*wide; this.nextHex.x = minx - .87*wide }
    this.nextHex.x = Math.round(this.nextHex.x); this.nextHex.y = Math.round(this.nextHex.y)
    this.undoCont.x = this.nextHex.x
    this.undoCont.y = this.nextHex.y + 100
    this.hexMap.hexCont.addChild(this.nextHex.cont)  // single Hex to hold a Stone to play
    this.hexMap.markCont.addChild(this.undoCont)

    this.bgRect = this.setBackground(this.scaleCont, bgr) // bounded by bgr
    let p00 = this.scaleCont.localToLocal(bgr.x, bgr.y, this.hexMap.hexCont) 
    let pbr = this.scaleCont.localToLocal(bgr.x+bgr.w, bgr.y+bgr.h, this.hexMap.hexCont)
    this.hexMap.hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)
    this.setupUndoButtons(55, 60, 45, bgr)

    this.gamePlay.setNextPlayer(this.gamePlay.allPlayers[0])   // make a placeable Stone for Player[0]
    this.makeMiniMap(this.scaleCont, -(200+TP.mHexes*TP.hexRad), 600+100*TP.mHexes)

    this.on(S.add, this.gamePlay.addStoneEvent, this.gamePlay)[S.Aname] = "addStone"
    this.on(S.remove, this.gamePlay.removeStoneEvent, this.gamePlay)[S.Aname] = "removeStone"
    this.stage.update()
  }
  logCurPlayer(curPlayer) {
    const history = this.gamePlay.history
    const tn = this.gamePlay.turnNumber
    const lm = history[0]
    const prev = lm?.toString() || ""
    const capd = lm?.captured || [] //this.gamePlay.lastCaptured 
    const board = !!this.hexMap.allStones[0] && lm?.board // TODO: hexMap.allStones>0 but history.len == 0
    const robo = curPlayer.useRobo ? "robo" : "----"
    const info = { turn: tn, plyr: curPlayer.name, prev, capd, gamePlay: this.gamePlay, board }
    console.log(stime(this, `.setNextPlayer ----${robo}----`), info);
  }
  showRedoUndoCount() {
    this.undoText.text = `${this.gamePlay.undoRecs.length}`
    this.redoText.text = `${this.gamePlay.redoMoves.length}`
  }
  setNextPlayer(log: boolean = true): Player {
    let curPlayer = this.gamePlay.curPlayer // after gamePlay.setNextPlayer()
    if (log) this.logCurPlayer(curPlayer)
    this.showRedoUndoCount()
    this.putButtonOnPlayer(curPlayer);
    return curPlayer
  }
  putButtonOnPlayer(player: Player) {
    this.nextHex.setColor(player.color)
    let stone = this.nextHex.stone
    stone[S.Aname] = `nextHex:${this.gamePlay.turnNumber}`
    this.dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
    this.dragger.clickToDrag(stone)
    this.hexMap.update()
    player.makeMove(stone) // provoke to robo-player: respond with addStoneEvent;
  }

  hexUnderObj(dragObj: DisplayObject) {
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.hexCont)
    return this.hexMap.hexUnderPoint(pt.x, pt.y)
  }
  _dropTarget: Hex2;
  get dropTarget() { return this._dropTarget}
  set dropTarget(hex: Hex2) { hex = (hex || this.nextHex); this._dropTarget = hex; this.hexMap.showMark(hex)}

  /** would be 'captured' by dropTarget. (like: history[-1].captured) */
  viewCaptured: Hex[] = []
  /** display captured mark on would be captured Hex(s) */
  markViewCaptured(captured: Hex[]) {
    this.viewCaptured = captured
    this.viewCaptured.forEach(hex => hex.markCapture()) // show Mark *above* stoneCont
  }
  /** remove captured mark from would be captured Hex(s) */
  unmarkViewCaptured() { 
    this.viewCaptured.forEach(hex => hex.unmarkCapture())
    this.viewCaptured = []
  }
  dragShift = false // last shift state in dragFunc
  dragHex: Hex2 = undefined // last hex in dragFunc
  isDragging() { return !!this.dragHex }

  stopDragging(target: Hex2 = this.nextHex) {
    //console.log(stime(this, `.stopDragging: target=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (!this.isDragging()) return
    target && (this.dropTarget = target)
    this.dragger.stopDrag()
  }

  hexStatus: { stoneColor0?: Map<Hex, HEX_STATUS>, stoneColor1?: Map<Hex, HEX_STATUS> }
  getHexStatus(hex: Hex, color: StoneColor) {
    let status = this.hexStatus[color].get(hex)
    return status ? { found: true, sui: status.sui, caps: status.caps } : { found: false }
  }
  
  dragFunc(stone: Stone, ctx: DragInfo): void {
    const hex = this.hexUnderObj(stone)
    const shift = ctx.event.nativeEvent ? ctx.event.nativeEvent.shiftKey : false
    const color = shift ? otherColor(stone.color) : stone.color
    const nonTarget = (hex: Hex) => { this.dropTarget = this.nextHex }
    if (ctx.first) {
      this.dragShift = shift
      this.dropTarget = this.nextHex
      this.dragHex = this.nextHex   // indicate DRAG in progress
      this.hexStatus = { }
      this.hexStatus[stoneColor0] = new Map<Hex, HEX_STATUS>()
      this.hexStatus[stoneColor1] = new Map<Hex, HEX_STATUS>()
    }
    if (!hex) return
    if (shift == this.dragShift && hex == this.dragHex) return    // nothing new
    if (shift != this.dragShift) stone.paint(shift ? color : undefined) // otherColor or orig color
    this.dragShift = shift
    this.dragHex = hex
    this.unmarkViewCaptured() // a new Hex/target, remove prior capture marks
    if (!this.gamePlay.isLegalMove(hex, color, (h,c)=>true)) // bypass getCaptures
      return nonTarget(hex) 

    let { found, sui, caps } = this.getHexStatus(hex, color) // see if sui&caps is cached
    if (!found) {
      caps = this.gamePlay.getCaptures(hex, color) // set captured and undoCapture
      sui = !caps
      this.hexStatus[color].set(hex, { found: true, sui, caps })
    }
    if (!!sui) return nonTarget(hex)
    if (!!caps) this.markViewCaptured(caps)
    if (!!shift) {
      nonTarget(hex)
      this.hexMap.showMark(hex)  // just showMark(hex)
    } else {
      this.dropTarget = hex  // dropTarget & showMark(hex)
    }
  }

  dropFunc(stone: Stone = this.nextHex.stone, ctx?: DragInfo) {
    // stone.parent == hexMap.stoneCont; nextHex.stone == stone
    this.dragHex = undefined       // indicate NO DRAG in progress
    this.unmarkViewCaptured()      // before doPlayerMove() sets them for real
    stone.paint()
    let target = this.dropTarget 
    stone.x = target.x
    stone.y = target.y
    if (target === this.nextHex) return
    this.dragger.stopDragable(stone)
    this.dispatchEvent(new HexEvent(S.add, target, stone)) // gamePlay.doPlayerMove()
  }
 
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
    this.dragger = new Dragger(scaleC)
    if (!!scaleC.stage.canvas) {
      // Special case of makeDragable; drag the parent of Dragger!
      this.dragger.makeDragable(scaleC, scaleC, undefined, undefined, true); // THE case where not "useDragCont"
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      this.bindKeysToScale("a", scaleC, 800, 10)
      KeyBinder.keyBinder.setKey(' ', {thisArg: this, func: this.dragStone})
    }
    return scaleC
  }
  /** attach nextHex.stone to mouse-drag */
  dragStone() {
    if (this.isDragging()) {
      this.stopDragging(this.dropTarget) // drop and make move
    } else {
      this.nextHex.stone?.parent && this.dragger.dragTarget(this.nextHex.stone, { x: TP.hexRad / 2, y: TP.hexRad / 2 })
    }
  }

  setBackground(scaleC: Container, bounds: XYWH, bgColor: string = TP.bgColor) {
    let bgRect = new Shape(); bgRect[S.Aname] = "BackgroundRect"
    if (!!bgColor) {
      // specify an Area that is Dragable (mouse won't hit "empty" space)
      bgRect.graphics.f(bgColor).r(bounds.x, bounds.y, bounds.w, bounds.h);
      scaleC.addChildAt(bgRect, 0);
      //console.log(stime(this, ".makeScalableBack: background="), background);
    }
    return bgRect
  }
  /** 
   * @param xos x-offset-to-center in Original Scale
   * @param xos y-offset-to-center in Original Scale
   * @param scale Original Scale
   */
  // bindKeysToScale(scaleC, 800, 0, scale=.324)
  bindKeysToScale(char: string, scaleC: ScaleableContainer, xos: number, yos: number) {
    let ns0 = scaleC.getScale(), sXY = { x: -scaleC.x, y: -scaleC.y } // generally == 0,0
    let nsA = scaleC.findIndex(.5), apt = { x: -xos, y: -yos } 
    let nsZ = scaleC.findIndex(ns0), zpt = { x: -xos, y: -yos } 
    
    // set Keybindings to reset Scale:
    /** xy in [unscaled] model coords; sxy in screen coords */
    const setScaleXY = (si?: number, xy?: XY, sxy: XY = sXY) => {
      let ns = scaleC.setScaleXY(si, xy, sxy)
      //console.log({si, ns, xy, sxy, cw: this.canvas.width, iw: this.map_pixels.width})
      this.stage.update()
    } 
    let setScaleZ = () => {
      ns0 = scaleC.getScale()
      nsZ = scaleC.findIndex(ns0)
      zpt = { x: -scaleC.x/ns0, y: -scaleC.y/ns0 }
    };
    let goup = () => {
      this.stage.getObjectsUnderPoint(500, 100, 1) 
    }

    // Scale-setting keystrokes:
    KeyBinder.keyBinder.setKey("x", { func: () => setScaleZ() });
    KeyBinder.keyBinder.setKey("z", { func: () => setScaleXY(nsZ, zpt) });
    KeyBinder.keyBinder.setKey("a", { func: () => setScaleXY(nsA, apt) });
    KeyBinder.keyBinder.setKey("p", { func: () => goup(), thisArg: this});
    KeyBinder.keyBinder.dispatchChar(char)
  }
}