import { AT, C, Constructor, Dragger, DragInfo, F, KeyBinder, S, ScaleableContainer, stime, XY } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { GamePlay as GamePlayLib, NamedContainer, RectShape, Table as TableLib } from "@thegraid/hexlib"
import { GamePlay, Progress } from "./game-play";
import { Hex, Hex2, HexMap, IHex } from "./hex";
import { HexEvent } from "./hex-event";
import { H, XYWH } from "./hex-intfs";
import { TablePlanner } from "./planner";
import { Player } from "./player";
import { StatsPanel } from "./stats";
import { otherColor, PlayerColor, playerColor0, playerColor1, PlayerColorRecord, playerColorRecord, playerColorRecordF, TP } from "./table-params";
import { NamedObject} from '@thegraid/hexlib';

/**
 * Graphical representation of the 'color' of a Move onto the HexMap.
 *
 * can be repainted temporarily by 'shift', but that does not change the underlying color.
 */
export class Stone extends Shape {
  static radius: number = TP.hexRad
  static height: number = Stone.radius*H.sqrt3/2
  get radius() { return Stone.height -1 }
  readonly color: PlayerColor;

  /** Stone is a Shape with a PlayerColor */
  constructor(color?: PlayerColor) {
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
  static yoff = playerColorRecord(80, 80)
  static xoff = playerColorRecord(-100, 50)
  static make(sc: PlayerColor, parent: Container) {
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
export class Table  { // TODO: extends TableLib
  disp: EventDispatcher = this as any as EventDispatcher;
  namedOn(Aname: string, type: string, listener: (eventObj: Object) => boolean | void, scope?: Object, once?: boolean, data?: any, useCapture = false) {
    const list2 = this.disp.on(type, listener, scope, once, data, useCapture) as NamedObject;
    list2.Aname = Aname;
  }
  statsPanel: StatsPanel;
  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: ScaleableContainer
  bgRect: Shape
  hexMap: HexMap; // from gamePlay.hexMap
  nextHex: Hex2;
  undoCont: Container = new NamedContainer('UndoCont')
  undoShape: Shape = new Shape();
  skipShape: Shape = new Shape();
  redoShape: Shape = new Shape();
  undoText: Text = new Text('', F.fontSpec(30));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(30));  // length of history stack
  winText: Text = new Text('', F.fontSpec(40), 'green')
  winBack: Shape = new Shape(new Graphics().f(C.nameToRgbaString("lightgrey", .6)).r(-180, -5, 360, 130))

  dragger: Dragger
  progressMarker: PlayerColorRecord<ProgressMarker>

  constructor(stage: Stage) {
    // super();
    EventDispatcher.initialize(this);

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
    let undoC = this.undoCont;  // holds the undo buttons.
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
    ProgressMarker.yoff = playerColorRecord(120, 120)
    this.progressMarker = playerColorRecordF((sc) => ProgressMarker.make(sc, undoC))
    let pm0 = this.progressMarker[playerColor0]
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
        let info = { hex, stone: hex.playerColor, InfName }
        info[`Inf[${playerColor0}]`] = hex.inf[playerColor0]
        info[`Inf[${playerColor1}]`] = hex.inf[playerColor1]
        info[`Infm[${playerColor0}]`] = hex.infm[playerColor0]
        info[`Infm[${playerColor1}]`] = hex.infm[playerColor1]
        console.log(`HexInspector:`, hex.Aname, info)
      })
    let toggleText = (evt: MouseEvent, vis?: boolean) => {
      if (!toggle) return (toggle = true, undefined) // skip one 'click' when pressup/dropfunc
      this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis))
      this.hexMap.mapCont.hexCont.updateCache()  // when toggleText: hexInspector
      this.hexMap.update()               // after toggleText & updateCache()
    }
    qShape.on(S.click, toggleText, this) // toggle visible
    toggleText(undefined, true)         // set initial visibility
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
    let c0 = TP.colorScheme[playerColor0], c1 = TP.colorScheme[playerColor1]
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
    const miniMap = this.miniMap = new HexMap(Stone.radius, true, Hex2, 'miniMap');
    miniMap.makeAllDistricts(1, TP.mHexes);

    const mapCont = miniMap.mapCont, nh = TP.nHexes;
    const rot = [0, 30, 10.893, 6.587, 4.715, 3.57][nh] ?? 2.5;
    const rotC = (rot - 30), rotH = (nh === 1) ? 0 : ( - rot);
    let bgHex = new Shape()
    bgHex.graphics.f(TP.bgColor).dp(0, 0, TP.hexRad * (2. * TP.mHexes - 1), 6, 0, 60)
    parent.addChild(mapCont)
    mapCont.addChildAt(bgHex, 0)
    mapCont.x = x; mapCont.y = y
    mapCont.rotation = rotC
    miniMap.forEachHex<Hex2>(h => {
      h.distText.visible = h.rcText.visible = false;
      h.cont.rotation = rotH; h.cont.scaleX = h.cont.scaleY = .985
      h.cont.updateCache();
    })
    mapCont.visible = (nh > 1);
  }

  // TODO: inherit from TableLib
  /**
   * Center mapCont (w,h) within a Rectangle: { 0+x0, 0+y0, w+w0, h+h0 }
   *
   * All number in units of dxdc or dydr
   *
   * @Return the Rectangle, modifid by [dw, dh]
   *
   * @param x0 frame left; relative to scaleCont (offset from bgRect to hexCont)
   * @param y0 frame top; relative to scaleCont
   * @param w0 pad width; width of bgRect, beyond hexCont, centered on hexCont
   * @param h0 pad height; height of bgRect, beyond hexCont, centered on hexCont
   * @param dw extend bgRect to the right, not centered
   * @param dh extend bgRect to the bottom, not centered
   * @returns XYWH of a rectangle around mapCont hexMap
   */
  bgXYWH(x0 = -1, y0 = .5, w0 = 10, h0 = 1, dw = 0, dh = 0) {
    const hexMap = this.hexMap;
    // hexCont is offset to be centered on mapCont (center of hexCont is at mapCont[0,0])
    // mapCont is offset [0,0] to scaleCont
    const mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont);

    // background sized for hexMap:
    const { width, height } = hexCont.getBounds();
    const { dxdc, dydr } = hexMap.xywh;
    const { x, y, w, h } = { x: x0 * dxdc, y: y0 * dydr, w: width + w0 * dxdc, h: height + h0 * dydr }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = x + w / 2;
    mapCont.y = y + h / 2;
    // THEN: extend bgRect by (dw, dh):
    return { x, y, w: w + dw * dxdc, h: h + dh * dydr };
  }

  // TODO: inherit from TableLib
  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    this.hexMap = gamePlay.hexMap

    const xywh0 = this.bgXYWH();              // override bgXYHW() to supply default/arg values
    const hexCont = this.hexMap.mapCont.hexCont;
    const xywh1 = this.setBackground(this.scaleCont, xywh0); // bounded by xywh
    const { x, y, width, height } = hexCont.getBounds();
    hexCont.cache(x, y, width, height); // cache hexCont (bounded by bgr)

    const xywh = this.layoutTable2()

    this.setupUndoButtons(55, 60, 45, xywh)

    this.namedOn('playerMoveEvent', S.add, this.gamePlay.playerMoveEvent, this.gamePlay);
  }

  // TODO: override from TPLib:
  layoutTable2() {
    let hexMap = this.hexMap;
    // [re-]position mapCont
    const bgr = this.bgXYWH(-1, .5, 6, 1, -2, 0); // x0,y0, w0,h0, dw,dh

    // background sized for hexMap:
    const { dxdc, dydr } = hexMap.xywh

    // Layout nextHex: (upper left of bgr)
    const { x, y, w, h } = bgr;
    this.nextHex = new Hex2(hexMap, undefined, undefined, 'nextHex')
    this.nextHex.cont.scaleX = this.nextHex.cont.scaleY = 2
    this.nextHex.x = x + 3 * dxdc;
    this.nextHex.y = y + 3 * dydr;
    this.nextHex.x = Math.round(this.nextHex.x); this.nextHex.y = Math.round(this.nextHex.y)

    // tweak when hexMap is tiny:
    const nh = TP.nHexes, mh = TP.mHexes
    if (nh == 1 || nh + mh <= 5) {
      bgr.w += 4 * dxdc;
      bgr.h = Math.max(9 * dydr, (bgr.h + .67 * dydr));
      hexMap.mapCont.x += 3 * dxdc;
      this.nextHex.x = x - H.sqrt3 / 2 * dxdc; // also adj nextHex
    }
    this.scaleCont.removeChildAt(0); // the original bgRect
    this.setBackground(this.scaleCont, bgr)
    const undoYoff = 2 * dydr;
    this.nextHex.cont.parent.localToLocal(this.nextHex.x, this.nextHex.y+undoYoff, this.scaleCont, this.undoCont)
    this.scaleCont.addChild(this.undoCont)

    const metaRad = TP.hexRad * (TP.mHexes + 1);
    this.makeMiniMap(this.scaleCont, -(170 + metaRad), metaRad - 130)
    return bgr
  }

  startGame() {
    // NextPlayer is BLACK, but gamePlay will set curPlayer = WHITE
    this.gamePlay.setNextPlayer(Player.allPlayers[0])   // make a placeable Stone for Player[0]
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
    return this.hexMap.hexUnderPoint(pt.x, pt.y, false) as Hex2;
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
  markAllSacrifice(color: PlayerColor = this.gamePlay.curPlayer?.color, show = false) {
    if (!this.showSac || !color) return
    this.tablePlanner.syncToGame(this.gamePlay.iHistory)
    let capColor = H.sacColor1
    this.hexMap.forEachHex<Hex2>(hex => {
      if (hex.playerColor !== undefined) return
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
    console.groupCollapsed('unmarkAllSacrifice')
    this.allSacrifices.forEach(hex => hex.unmarkCapture())
    this.allSacrifices.clear()
    console.groupEnd()
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
  moveStoneToHex(ihex: IHex, sc: PlayerColor) {
    this.unmarkAllSacrifice()
    if (ihex.row < 0 || ihex.col < 0 /* Skip.hex */) return; // no move TODO: resign correctly
    const hex = Hex.ofMap(ihex, this.hexMap) as Hex2;
    this.hexMap.showMark(hex)
    this.disp.dispatchEvent(new HexEvent(S.add, hex, sc)) // -> GamePlay.playerMoveEvent(hex, sc)
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
      this.bindKeysToScale(scaleC)
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

  /**
   * Create a RectShape(bounds, bgColor) to drag the ScaleContainer
   *
   * Make a visible Rect that is Dragable (mouse won't hit "empty" space)
   * @param scaleC the ScaleContainer to be dragged; scaleC.addChildAt(rectShape, 0)
   * @param bounds the rectangle to define the RectShape
   * @param bgColor [TP.bgColor] to fill the RectShape (or '' set no RectShape)
   * @returns bounds
   */
  setBackground(scaleC: Container, bounds: XYWH, bgColor: string = TP.bgColor) {
    let rectShape = new RectShape(bounds, bgColor, '');
    rectShape[S.Aname] = "BackgroundRect";
    if (!!bgColor) {
      scaleC.addChildAt(rectShape, 0);
      //console.log(stime(this, ".makeScalableBack: background="), background);
    }
    this.bgRect = rectShape;
    return bounds;
  }

  bindKeysToScale(scaleC: ScaleableContainer, isc = 'a', xos = 540, yos = 10, scale0 = .5) {
    const nsA = scale0;
    const apt = { x: xos, y: yos }
    let nsZ = 0.647; //
    const zpt = { x: 120, y: 118 }

    // set Keybindings to reset Scale:
    /** save scale & offsets for later: */
    const saveScaleZ = () => {
      nsZ = scaleC.scaleX;
      zpt.x = scaleC.x; zpt.y = scaleC.y;
    }
    // xy is the fixed point, but is ignored because we set xy directly.
    // sxy is the final xy offset, saved by saveScaleZ()
    const setScaleXY = (ns?: number, sxy: XY = { x: 0, y: 0 }) => {
      scaleC.setScale(ns);
      //console.log({si, ns, xy, sxy, cw: this.canvas.width, iw: this.map_pixels.width})
      scaleC.x = sxy.x; scaleC.y = sxy.y;
      this.stage.update()
    }
    const getOop = () => {
      this.stage.getObjectsUnderPoint(500, 100, 1)
    }

    // Scale-setting keystrokes:
    KeyBinder.keyBinder.setKey(isc, { func: () => setScaleXY(nsA, apt) });
    KeyBinder.keyBinder.setKey("z", { func: () => setScaleXY(nsZ, zpt) });
    KeyBinder.keyBinder.setKey("x", { func: () => saveScaleZ() });
    KeyBinder.keyBinder.setKey("p", { func: () => getOop(), thisArg: this });
    KeyBinder.keyBinder.setKey('S-ArrowUp', { thisArg: this, func: this.zoom, argVal: 1.03 })
    KeyBinder.keyBinder.setKey('S-ArrowDown', { thisArg: this, func: this.zoom, argVal: 1 / 1.03 })
    KeyBinder.keyBinder.setKey('S-ArrowLeft', { thisArg: this, func: this.pan, argVal: { x: -10, y: 0 } })
    KeyBinder.keyBinder.setKey('ArrowRight', { thisArg: this, func: this.pan, argVal: { x: 10, y: 0 } })
    KeyBinder.keyBinder.setKey('ArrowLeft', { thisArg: this, func: this.pan, argVal: { x: -10, y: 0 } })
    KeyBinder.keyBinder.setKey('S-ArrowRight', { thisArg: this, func: this.pan, argVal: { x: 10, y: 0 } })
    KeyBinder.keyBinder.setKey('ArrowUp', { thisArg: this, func: this.pan, argVal: { x: 0, y: -10 } })
    KeyBinder.keyBinder.setKey('ArrowDown', { thisArg: this, func: this.pan, argVal: { x: 0, y: 10 } })

    KeyBinder.keyBinder.dispatchChar(isc)
  }

  zoom(z = 1.1) {
    const stage = this.stage;
    const pxy = { x: stage.mouseX / stage.scaleX, y: stage.mouseY / stage.scaleY };
    this.scaleCont.setScale(this.scaleCont.scaleX * z, pxy);
    // would require adjusting x,y offsets, so we just scale directly:
    // TODO: teach ScaleableContainer to check scaleC.x,y before scroll-zooming.

    // this.scaleCont.scaleX = this.scaleCont.scaleY = this.scaleCont.scaleX * z;
    this.stage?.update();
  }
  pan(xy: XY) {
    this.scaleCont.x += xy.x;
    this.scaleCont.y += xy.y;
    this.stage?.update();
  }
}
