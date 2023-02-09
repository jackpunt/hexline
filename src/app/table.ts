import { AT, C, Dragger, DragInfo, F, KeyBinder, S, ScaleableContainer, stime, XY } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { GamePlay, Progress } from "./game-play";
import { Hex, Hex2, HexMap, IHex } from "./hex";
import { HexEvent } from "./hex-event";
import { H, XYWH } from "./hex-intfs";
import { TablePlanner } from "./planner";
import { Player } from "./player";
import { StatsPanel } from "./stats";
import { otherColor, StoneColor, stoneColor0, stoneColor1, StoneColorRecord, stoneColorRecord, stoneColorRecordF, TP } from "./table-params";


/**
 * Graphical representation of the 'color' of a Move onto the HexMap.
 *
 * can be repainted temporarily by 'shift', but that does not change the underlying color.
 */
export class Stone extends Shape {
  static radius: number = TP.hexRad
  static height: number = Stone.radius*H.sqrt3/2
  get radius() { return Stone.height -1 }
  readonly color: StoneColor;

  /** Stone is a Shape with a StoneColor */
  constructor(color?: StoneColor) {
    super()
    this.color = color
    if (color) this.paint(color)
    else this.visible = false
  }
  paint(color = this.color) {
    this.paint1(TP.colorScheme[color])
  }
  paint2(color: string) {
    this.paint1(color)
    this.graphics.c().f(C.BLACK).dc(0, 0, this.radius/2) // put a hole in it!
    this.updateCache("destination-out") // clear center of Stone!
  }
  paint1(color: string) {
    let rad = this.radius
    this.graphics.c().f(color).dc(0, 0, rad)
    this.cache(-rad, -rad, 2*rad, 2*rad) // Stone
  }
}

class ProgressMarker extends Container {
  static yoff = stoneColorRecord(80, 80)
  static xoff = stoneColorRecord(-100, 50)
  static make(sc: StoneColor, parent: Container) {
    let p0 = { b: 0, tsec: 0, tn: 0 } as Progress
    let pm = new ProgressMarker(p0)
    pm.x = ProgressMarker.xoff[sc]
    pm.y = ProgressMarker.yoff[sc]
    parent.addChild(pm)
    return pm
  }
  // Container with series of Text arranged vertically.
  // update fills the Text.text with the given values.
  texts: Record<string, Text> = {}
  ymax = 0
  constructor(p0: Progress, font: string = F.fontSpec(36), color = C.BLACK) {
    super()
    let y = 0, lead = 5
    for (let pk in p0) {
      let val = p0[pk].toString()
      let text = new Text(val, font, color)
      this.texts[pk] = text
      text.y = y
      this.addChild(text)
      y += text.getMeasuredHeight() + lead
    }
    this.ymax = Math.max(this.ymax, y + lead)
  }
  update(progress: Progress) {
    for (let pk in progress) {
      this.texts[pk].text = progress[pk]?.toString() || ''
    }
    this.stage.update()
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
  winText: Text = new Text('', F.fontSpec(40), 'green')
  winBack: Shape = new Shape(new Graphics().f(C.nameToRgbaString("lightgrey", .6)).r(-180, -5, 360, 130))

  dragger: Dragger
  progressMarker: StoneColorRecord<ProgressMarker>

  constructor(stage: Stage) {
    super();

    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    this.scaleCont = this.makeScaleCont(!!this.stage.canvas) // scaleCont & background
  }
  setupUndoButtons(xOffs: number, bSize: number, skipRad: number, bgr: XYWH) {
    this.skipShape.graphics.f("white").dp(0, 0, 40, 4, 0, skipRad)
    this.undoShape.graphics.f("red").dp(-xOffs, 0, bSize, 3, 0, 180);
    this.redoShape.graphics.f("green").dp(+xOffs, 0, bSize, 3, 0, 0);
    this.undoText.x = -52; this.undoText.textAlign = "center"
    this.redoText.x = 52; this.redoText.textAlign = "center"
    this.winText.x = 0; this.winText.textAlign = "center"
    let undoC = this.undoCont; undoC.name = "undo buttons" // holds the undo buttons.
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = -14;
    undoC.addChild(this.redoText); this.redoText.y = -14;
    let bgrpt = this.bgRect.parent.localToLocal(bgr.x, bgr.h, undoC) // TODO: align with nextHex(x & y)
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
    this.enableHexInspector(52)
    let aiControl = this.aiControl('pink', 75); aiControl.x = 0; aiControl.y = 100
    undoC.addChild(aiControl)
    ProgressMarker.yoff = stoneColorRecord(120, 120)
    this.progressMarker = stoneColorRecordF((sc) => ProgressMarker.make(sc, this.undoCont))
    let pm0 = this.progressMarker[stoneColor0]
    let pmy = pm0.ymax + pm0.y // pm0.parent.localToLocal(0, pm0.ymax + pm0.y, undoC)
    let progressBg = new Shape(), bgw = 200, bgym = 240, y0 = 0
    let bgc = C.nameToRgbaString(TP.bgColor, .8)
    progressBg.graphics.f(bgc).r(-bgw/2, y0, bgw, bgym-y0)
    undoC.addChildAt(progressBg, 0)
    undoC.addChild(this.winBack);
    undoC.addChild(this.winText);
    this.dragger.makeDragable(undoC)
    this.winText.y = Math.min(pmy, bgrpt.y) // 135 = winBack.y = winBack.h
    this.winBack.visible = this.winText.visible = false
    this.winBack.x = this.winText.x; this.winBack.y = this.winText.y;
  }
  showWinText(msg?: string, color = 'green') {
    this.winText.text = msg || "COLOR WINS:\nSTALEMATE (10 -- 10)\n0 -- 0"
    this.winText.color = color
    this.winText.visible = this.winBack.visible = true
    this.hexMap.update()
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
        let InfDisp = this.hexMap.mapCont.infCont.children.filter(obj => obj.x == hex.x && obj.y == hex.y)
        let InfName = InfDisp.map(i => i[S.Aname])
        let info = { hex, stone: hex.stoneColor, InfName }
        info[`Inf[${stoneColor0}]`] = hex.inf[stoneColor0]
        info[`Inf[${stoneColor1}]`] = hex.inf[stoneColor1]
        info[`Infm[${stoneColor0}]`] = hex.infm[stoneColor0]
        info[`Infm[${stoneColor1}]`] = hex.infm[stoneColor1]
        console.log(`HexInspector:`, hex.Aname, info)
      })
    let toggleText = (evt: MouseEvent, vis?: boolean) => {
      if (!toggle) return (toggle = true, undefined) // skip one 'click' when pressup/dropfunc
      this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis))
      this.hexMap.mapCont.hexCont.updateCache()  // when toggleText: hexInspector
      this.hexMap.update()               // after toggleText & updateCache()
    }
    qShape.on(S.click, toggleText, this) // toggle visible
    toggleText(undefined, false)         // set initial visibility
  }
  aiControl(color = TP.bgColor, dx = 100, rad = 16) {
    let table = this
    // c m v on buttons
    let makeButton = (dx: number, bc = TP.bgColor, tc = TP.bgColor, text: string, key = text) => {
      let cont = new Container
      let circ = new Graphics().f(bc).drawCircle(0, 0, rad)
      let txt = new Text(text, F.fontSpec(rad), tc)
      txt.y = - rad/2
      txt.textAlign = 'center'
      txt.mouseEnabled = false
      cont.x = dx
      cont.addChild(new Shape(circ))
      cont.addChild(txt)
      cont.on(S.click, (ev) => { KeyBinder.keyBinder.dispatchChar(key) })
      return cont
    }
    let bpanel = new Container()
    let c0 = TP.colorScheme[stoneColor0], c1 = TP.colorScheme[stoneColor1]
    let cm = "rgba(100,100,100,.5)"
    let bc = makeButton(-dx, c0, c1, 'C', 'c')
    let bv = makeButton(dx, c1, c0, 'V', 'v')
    let bm = makeButton(0, cm, C.BLACK, 'M', 'm'); bm.y -= 10
    let bn = makeButton(0, cm, C.BLACK, 'N', 'n'); bn.y += rad*2
    let bs = makeButton(0, cm, C.BLACK, ' ', ' '); bs.y += rad*5
    bpanel.addChild(bc)
    bpanel.addChild(bv)
    bpanel.addChild(bm)
    bpanel.addChild(bn)
    bpanel.addChild(bs)
    return bpanel
  }
  miniMap: HexMap;
  makeMiniMap(parent: Container, x: number, y: number) {
    let miniMap = this.miniMap = new HexMap(Stone.radius, true)
    let mapCont = miniMap.mapCont
    let rot = 7, rotC = (30-rot), rotH = (rot - 60)
    if (TP.nHexes == 1) rotC = rotH = 0
    miniMap.makeAllDistricts(TP.mHexes, 1)
    let bgHex = new Shape()
    bgHex.graphics.f(TP.bgColor).dp(0, 0, TP.hexRad*(2*TP.mHexes-1), 6, 0, 60)
    mapCont.addChildAt(bgHex, 0)
    mapCont.x = x; mapCont.y = y
    mapCont.rotation = rotC
    miniMap.forEachHex<Hex2>(h => {
      h.distText.visible = h.rcText.visible = false;
      h.cont.rotation = rotH; h.cont.scaleX = h.cont.scaleY = .985
    })
    parent.addChild(mapCont)
    mapCont.visible = (TP.nHexes > 1)
  }

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    let hexMap = this.hexMap = gamePlay.hexMap

    hexMap.addToCont().initInfluence()
    hexMap.makeAllDistricts(TP.mHexes, TP.nHexes) // typically: 3,3 or 2,4

    let mapCont = hexMap.mapCont;
    this.scaleCont.addChild(mapCont)

    let hexRect = hexMap.mapCont.hexCont.getBounds()
    // background sized for hexMap:
    let high = hexMap.height, wide = hexMap.width // h=rad*1.5; w=rad*r(3)
    let miny = hexRect.y - high, minx = hexRect.x - wide
    let { width, height } = hexMap.wh
    let bgr: XYWH = { x: 0, y: 0, w: width, h: height + high}
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = (bgr.w) / 2
    mapCont.y = (bgr.h) / 2

    this.nextHex = new Hex2(hexMap, undefined, undefined, 'nextHex')
    this.nextHex.cont.scaleX = this.nextHex.cont.scaleY = 2
    this.nextHex.x = minx + 2 * wide; this.nextHex.y = miny + 1.4 * high;
    // tweak when hexMap is tiny:
    let nh = TP.nHexes, mh = TP.mHexes
    if (nh == 1 || nh + mh <= 5) { bgr.w += 3*wide; bgr.h += 50; mapCont.x += 3*wide; this.nextHex.x = minx - H.sqrt3/2*wide }
    this.nextHex.x = Math.round(this.nextHex.x); this.nextHex.y = Math.round(this.nextHex.y)

    this.bgRect = this.setBackground(this.scaleCont, bgr) // bounded by bgr
    let p00 = this.scaleCont.localToLocal(0, 0, hexMap.mapCont.hexCont)
    let pbr = this.scaleCont.localToLocal(bgr.w, bgr.h, hexMap.mapCont.hexCont)
    hexMap.mapCont.hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)
    this.nextHex.cont.parent.localToLocal(this.nextHex.x, this.nextHex.y+100, this.scaleCont, this.undoCont)
    this.scaleCont.addChild(this.undoCont)
    this.setupUndoButtons(55, 60, 45, bgr)

    this.makeMiniMap(this.scaleCont, -(200+TP.mHexes*TP.hexRad), 600+100*TP.mHexes)

    this.on(S.add, this.gamePlay.playerMoveEvent, this.gamePlay)[S.Aname] = "playerMoveEvent"
  }

  startGame() {
    // NextPlayer is BLACK, but gamePlay will set curPlayer = WHITE
    this.gamePlay.setNextPlayer(this.gamePlay.allPlayers[0])   // make a placeable Stone for Player[0]
  }
  logCurPlayer(curPlayer: Player) {
    const history = this.gamePlay.history
    const tn = this.gamePlay.turnNumber
    const lm = history[0]
    const prev = lm ? `${lm.Aname}${lm.ind}#${tn-1}` : ""
    const capd = lm?.captured || [] //this.gamePlay.lastCaptured
    const board = !!this.hexMap.allStones[0] && lm?.board // TODO: hexMap.allStones>0 but history.len == 0
    const robo = curPlayer.useRobo ? AT.ansiText(['red','bold'],"robo") : "----"
    const info = { turn: `#${tn}`, plyr: curPlayer.name, prev, capd, gamePlay: this.gamePlay, board }
    console.log(stime(this, `.setNextPlayer --${robo}--`), info);
  }
  showRedoUndoCount() {
    this.undoText.text = `${this.gamePlay.undoRecs.length}`
    this.redoText.text = `${this.gamePlay.redoMoves.length}`
  }
  showNextPlayer(log: boolean = true) {
    let curPlayer = this.gamePlay.curPlayer // after gamePlay.setNextPlayer()
    if (log) this.logCurPlayer(curPlayer)
    this.showRedoUndoCount()
    this.showNextStone(curPlayer);
    this.markAllSacrifice(curPlayer.color)
    this.hexMap.update()
  }
  showNextStone(player: Player) {
    let color = player.color
    this.nextHex.clearColor()           // remove prior Stone from the game [thank you for your service]
    this.nextHex.setColor(color)        // make a Stone to drag
    let stone = this.nextHex.stone
    stone[S.Aname] = `nextHex:${this.gamePlay.turnNumber}`
    this.dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
    this.dragger.clickToDrag(stone)
    this.hexMap.update()   // after showNextStone
  }

  hexUnderObj(dragObj: DisplayObject) {
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.mapCont.hexCont)
    return this.hexMap.hexUnderPoint(pt.x, pt.y)
  }
  _dropTarget: Hex2;
  get dropTarget() { return this._dropTarget}
  set dropTarget(hex: Hex2) { hex = (hex || this.nextHex); this._dropTarget = hex; this.hexMap.showMark(hex)}

  /** would be 'captured' by dropTarget. (like: history[-1].captured) */
  viewCaptured: Hex2[] = []
  /** display captured mark on would be captured Hex(s) */
  markViewCaptured(captured: Hex2[]) {
    this.viewCaptured = captured
    this.viewCaptured.forEach(hex => hex.markCapture()) // show Mark *above* stoneCont
  }
  /** remove captured mark from would be captured Hex(s) */
  unmarkViewCaptured() {
    this.viewCaptured.forEach(hex => hex.unmarkCapture())
    this.viewCaptured = []
  }

  allSacrifices: Set<Hex2> = new Set()
  /**
   * @param color shift-key overrides curPlayer.color
   * @param show dragFunc sets 'true' to force show (overriding !showSac || !color)
   */
  markAllSacrifice(color: StoneColor = this.gamePlay.curPlayer?.color, show = false) {
    if (!this.showSac || !color) return
    this.tablePlanner.syncToGame(this.gamePlay.iHistory)
    let capColor = H.sacColor1
    this.hexMap.forEachHex((hex: Hex2) => {
      if (hex.stoneColor !== undefined) return
      if (this.gamePlay.history[0]?.captured.includes(hex)) return
      let [legal, sacrifice] = this.gamePlay.isMoveLegal(hex, color, (move) => {
        if (!move.sacrifice && this.tablePlanner.isWastedMove(move)) {
          if (this.showSac) {
            this.allSacrifices.add(hex) // not actual sacrifice: will unmarkCapture()
            hex.markCapture(H.fjColor)
          }
        }
      })
      if (sacrifice) {
        this.allSacrifices.add(hex)
        hex.markCapture(legal ? H.sacColor2 : capColor)
      }
    })
  }
  unmarkAllSacrifice() {
    this.allSacrifices.forEach(hex => hex.unmarkCapture())
    this.allSacrifices.clear()
  }
  set showInf(val) { (this.hexMap.mapCont.infCont.visible = val) ? this.markAllSacrifice() : this.unmarkAllSacrifice() }
  get showInf() { return this.hexMap.mapCont.infCont.visible }
  _showSac = true
  get showSac() { return this._showSac }
  set showSac(val: boolean) { (this._showSac = val) ? this.markAllSacrifice() : this.unmarkAllSacrifice() }

  dragShift = false // last shift state in dragFunc
  dragHex: Hex2 = undefined // last hex in dragFunc
  protoHex: Hex2 = undefined // hex showing protoMove influence & captures
  isDragging() { return this.dragHex !== undefined }

  stopDragging(target: Hex2 = this.nextHex) {
    //console.log(stime(this, `.stopDragging: target=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (!this.isDragging()) return
    this.unmarkAllSacrifice()
    target && (this.dropTarget = target)
    this.dragger.stopDrag()
  }

  dragFunc(stone: Stone, ctx: DragInfo): void {
    const hex: Hex2 | false = this.hexUnderObj(stone)
    const shiftKey = ctx.event.nativeEvent ? ctx.event.nativeEvent.shiftKey : false
    const color = shiftKey ? otherColor(stone.color) : stone.color
    const nonTarget = (hexn: Hex) => { this.dropTarget = this.nextHex }
    if (ctx.first) {
      this.dragShift = false
      this.dropTarget = this.nextHex
      this.dragHex = this.nextHex   // indicate DRAG in progress
      this.markAllSacrifice(stone.color, true)
    }
    let remarkFromShift = false
    if (shiftKey != this.dragShift) {
      stone.paint(shiftKey ? color : undefined) // otherColor or orig color
      if (shiftKey) { this.unmarkAllSacrifice() } else { remarkFromShift = true }
    }
    if (shiftKey == this.dragShift && hex == this.dragHex) return    // nothing new
    this.dragShift = shiftKey

    // close previous dragHex:
    if (this.protoHex) { this.gamePlay.undoProtoMove(); this.protoHex = undefined }
    if (remarkFromShift) this.markAllSacrifice(color, true)

    this.dragHex = hex
    if (!hex || hex == this.nextHex) return nonTarget(hex)
    // if isLegalMove then leave protoMove on display:
    if (this.gamePlay.isMoveLegal(hex, color, false)[0]) this.protoHex = hex
    else return nonTarget(hex)

    if (shiftKey) {
      nonTarget(hex)
      this.hexMap.showMark(hex)  // just showMark(hex)
    } else {
      this.dropTarget = hex  // dropTarget & showMark(hex)
    }
  }

  /** when nextHex.stone is dropped
   * @param stone will be === nextHex.stone
   */
  dropFunc(stone: Stone = this.nextHex.stone, ctx?: DragInfo) {
    // stone.parent == hexMap.stoneCont; nextHex.stone == stone
    this.dragHex = undefined       // indicate NO DRAG in progress
    Hex2.infVis = true
    if (this.protoHex) { this.gamePlay.undoProtoMove(); this.protoHex = undefined }
    stone.paint()
    let target = this.dropTarget
    stone.x = target.x
    stone.y = target.y
    if (target === this.nextHex) return
    this.dragger.stopDragable(stone)
    this.doTableMove(target.iHex, stone.color) // TODO: migrate to doTableMove vs dispatchEVent
  }
  _tablePlanner: TablePlanner
  get tablePlanner() {
    return this._tablePlanner ||
    (this._tablePlanner = new TablePlanner(this.gamePlay))
  }
  /**
   * All manual moves feed through this (drop & redo)
   * TablePlanner.logMove(); then dispatchEvent() --> gamePlay.doPlayerMove()
   */
  doTableMove(ihex: IHex, sc = this.nextHex.stone.color) {
    if (sc != this.nextHex.stone.color) debugger;
    let iHistory = this.gamePlay.iHistory
    this.tablePlanner.doMove(ihex, sc, iHistory).then(ihex => this.moveStoneToHex(ihex, sc))
  }
  /** All moves (GUI & player) feed through this: */
  moveStoneToHex(ihex: IHex, sc: StoneColor) {
    this.unmarkAllSacrifice()
    let hex = Hex.ofMap(ihex, this.hexMap)
    this.hexMap.showMark(hex)
    this.dispatchEvent(new HexEvent(S.add, hex, sc)) // -> GamePlay.playerMoveEvent(hex, sc)
  }

  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  scaleParams = { initScale: .125, scale0: .05, scaleMax: 1, steps: 30, zscale: .20,  };

  /** makeScaleableBack and setup scaleParams
   * @param bindkeys true if there's a GUI/user/keyboard
   */
  makeScaleCont(bindKeys: boolean): ScaleableContainer {
    this.scaleParams.initScale = 0.125; // .125 if full-size cards
    /** scaleCont: a scalable background */
    let scaleC = new ScaleableContainer(this.stage, this.scaleParams);
    this.dragger = new Dragger(scaleC)
    if (!!scaleC.stage.canvas) {
      // Special case of makeDragable; drag the parent of Dragger!
      this.dragger.makeDragable(scaleC, scaleC, undefined, undefined, true); // THE case where not "useDragCont"
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      this.bindKeysToScale("a", scaleC, 820, 10)
      KeyBinder.keyBinder.setKey(' ', {thisArg: this, func: this.dragStone})
      KeyBinder.keyBinder.setKey('S-Space', {thisArg: this, func: this.dragStone})
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
