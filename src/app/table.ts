import { Stage, EventDispatcher, Container, Shape, Text, DisplayObject } from "createjs-module";
import { F, HexDir, RC, S, XY } from "./basic-intfs";
import { Dragger, DragInfo } from "./dragger";
import { GamePlay, Player } from "./game-play";
import { Hex, HexMap, InfDir } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder } from "./key-binder";
import { ScaleableContainer } from "./scaleable-container";
import { BoardStats, StatsPanel } from "./stats";
import { TP, StoneColor, stoneColors, otherColor, stoneColor0, stoneColor1 } from "./table-params";
import { stime } from "./types";

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
  nextHex: Hex = new Hex("grey", Stone.radius, undefined, undefined, {x: Stone.radius * 3, y: Stone.radius})
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
        let InfName = InfDisp.map(i => i[S.aname])
        let info = { hex, stone: hex.stoneColor, InfName }
        info[`Inf[${stoneColor0}]`] = hex.inf[stoneColor0]
        info[`Inf[${stoneColor1}]`] = hex.inf[stoneColor1]
        console.log(hex.Aname, info)
      })
  }

  layoutTable() {
    let radius = Stone.radius
    this.scaleCont = this.makeScaleCont(!!this.stage) // scaleCont & background
    let mapCont = new Container();
    mapCont[S.aname] = "mapCont"
    this.scaleCont.addChild(mapCont)

    this.hexMap = new HexMap(radius, mapCont)
    this.gamePlay.hexMap = this.hexMap          // ;this.markHex00()
    this.hexMap.hexCont.addChild(this.nextHex)  // single Hex to hold a Stone to play
    this.hexMap.markCont.addChild(this.undoCont)
    this.makeAllDistricts(TP.mHexes, TP.nHexes) // typically: 3,3 or 2,4

    let hexRect = this.hexMap.hexCont.getBounds()
    // background sized for nHexes:
    let hex00 = this.districtHexAry[0][0]
    let mh = TP.mHexes, nh= TP.nHexes, high = hex00.height * 1.5, wide = hex00.width * 2.0 // h=rad*1.5; w=rad*r(3)
    let miny = hexRect.y - high, maxy = hexRect.y+hexRect.height + high
    let minx = hexRect.x - wide, maxx = hexRect.x+hexRect.width + wide
    let bgr: XYWH = { x: 0, y: 0, w: (maxx - minx), h: (maxy - miny) }
    // align center of mapCont == hexMap with center of background
    mapCont.x = bgr.x + (bgr.w) / 2 - hex00.x
    mapCont.y = bgr.y + (bgr.h) / 2 - hex00.y
    //console.log({mapx: mapCont.x, mapy: mapCont.y, hex00x: hex00.x, hex00y: hex00.y})

    this.nextHex.x = minx + 2 * wide; this.nextHex.y = miny + 2.0 * high;
    // tweak when hexMap is tiny:
    if (nh == 1 || nh + mh <= 5) { bgr.w += 3*wide; mapCont.x += 3*wide; this.nextHex.x = minx - .5*wide }
    this.undoCont.x = this.nextHex.x
    this.undoCont.y = this.nextHex.y + 100

    this.setBackground(this.scaleCont, bgr) // bounded by bgr
    let p00 = this.scaleCont.localToLocal(bgr.x, bgr.y, this.hexMap.hexCont) 
    let pbr = this.scaleCont.localToLocal(bgr.x+bgr.w, bgr.y+bgr.h, this.hexMap.hexCont)
    this.hexMap.hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)

    this.makeAllPlayers()
    this.setNextPlayer(0)   // make a placeable Stone for Player[0]
    this.bStats = new BoardStats(this) // AFTER allPlayers are defined so can set pStats
    this.enableHexInspector()

    this.on(S.add, this.gamePlay.addStoneEvent, this.gamePlay)[S.aname] = "addStone"
    this.on(S.remove, this.gamePlay.removeStoneEvent, this.gamePlay)[S.aname] = "removeStone"
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

    this.hexMap.update()
    this.curPlayer.makeMove()
  }
  /** set hex.stone & addChild,  */
  setStone(stone: Stone, hex: Hex = this.nextHex) {
    let cont: Container = this.hexMap.stoneCont
    hex.parent.localToLocal(hex.x, hex.y, cont, stone)
    cont.addChild(stone)
    hex.stone = stone
    if (hex !== this.nextHex) {
      this.hexMap.allStones.push({ Aname: hex.Aname, hex: hex, color: stone.color, })
    } else {
      Dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
    }
  }
  /** clear hex.stone & removeChild */
  clearStone(hex: Hex): Stone {
    let stone = hex.stone
    if (stone) {
      this.hexMap.allStones = this.hexMap.allStones.filter(hsc => hsc.hex !== hex)
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
      this.hexMap.showMark()
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
  /**
   * 
   * @param mh order of meta-hexes (2 or 3 for this game)
   * @param nh size of meta-hex (1..6)
   * @param xy (graphical display offset)
   */
  makeAllDistricts(mh: number, nh: number, xy?: XY) {
    let mrc: RC = { col: Math.ceil(mh / 2), row: 2 }, district = 0
    let dirs: HexDir[] = ['NE', 'SE', 'S', 'SW', 'NW', 'N',] // N-S aligned!
    this.makeDistrict(nh, district++, mrc.row, mrc.col, xy) // Central District [0]
    for (let ring = 1; ring < mh; ring++) {
      //mrc.row -= 1 // start to North
      mrc = this.hexMap.nextRowCol(mrc, 'NW', this.hexMap.nsTopo(mrc)) // NW + NE => 'N' for next metaHex
      dirs.forEach(dir => {
        // newMetaHexesOnLine(ring, rc, dir, district, dcolor, hexAry, xy)
        for (let i = 0; i < ring; i++) {
          mrc = this.hexMap.nextRowCol(mrc, dir, this.hexMap.nsTopo(mrc))
          let hexAry = this.makeDistrict(nh, district++, mrc.row, mrc.col, xy)
          let dcolor = this.pickColor(hexAry[0])
          hexAry.forEach(hex => hex.setHexColor(dcolor))
        }
      })
    }
    //console.log(this.districtHexAry)
  }
  pickColor(hex: Hex): string {
    let adjColor: string[] = [hex.map.distColor[0]], dist0 = hex.district
    S.dirs.forEach(hd => {
      let nhex: Hex = hex
      while (!!(nhex = nhex.links[hd])) {
        if (nhex.district != dist0) { adjColor.push(nhex.color); return }
      }
    })
    return hex.map.distColor.find(ci => !adjColor.includes(ci))
  }
  /** 
   * @param nh number of hexes on a side
   */
  makeDistrict(nh: number, district: number, mr, mc, xy?: XY): Hex[] {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2*nh-1 
    let dcolor = (district == 0) ? 0 : (1 + ((district+nh+mr) % 6))
    // irow-icol define topology of MetaHex composed of HexDistrict 
    let irow = (mr, mc) => { 
      let ir = mr * dia - nh * (mcp+1) + 1
      ir -= Math.floor((mc)/2)              // - half a row for each metaCol
      return ir
    }
    let icol = (mr, mc, row) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh*3 -1)/2)) 
      ic += (nh - 1)                        // from left edge to center
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col 
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    let row0 = irow(mr, mc), col0 = icol(mr, mc, row0), hex: Hex;
    let hexAry = []; hexAry['Mr'] = mr; hexAry['Mc'] = mc; this.districtHexAry[district] = hexAry
    hexAry.push(hex = this.hexMap.addHex(row0, col0, district, dcolor, xy)) // The *center* hex
    let rc: RC = {row: row0, col: col0} // == {hex.row, hex.col}
    //console.groupCollapsed(`makelDistrict [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}:${district}-${dcolor}`)
    //console.log(`.makeDistrict: [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}`, hex)
    for (let ring = 1; ring < nh; ring++) {
      rc = this.hexMap.nextRowCol(rc, 'W') // step West to start a ring
      // place 'ring' hexes along each axis-line:
      ;(S.dirs as InfDir[]).forEach(dir => rc = this.newHexesOnLine(ring, rc, dir, district, dcolor, hexAry, xy))
    }
    //console.groupEnd()
    return hexAry
  }
  /**
   * 
   * @param n number of Hex to create
   * @param hex start with a Hex to the West of this Hex
   * @param dir after first Hex move this Dir for each other hex
   * @param district 
   * @param hexAry push created Hex(s) on this array
   * @param xy 
   * @returns RC of next Hex to create (==? RC of original hex)
   */
  newHexesOnLine(n, rc: RC, dir: InfDir, district: number, dcolor: number, hexAry: Hex[], xy?: XY): RC {
      //let dcolor = this.hexMap.distColor[district]
      let hex: Hex
      //hexAry.push(hex = this.hexMap.addHex(row, col-1, district, district, xy))
      for (let i = 0; i< n; i++) { 
        hexAry.push(hex = this.hexMap.addHex(rc.row, rc.col, district, dcolor, xy))
        //console.log(`.newHexesOnLine: [${hex.Aname}] hex=`, hex)
        rc = this.hexMap.nextRowCol(hex, dir)
      }
      return rc
    }
  /** Array of Hex for each District */
  districtHexAry: Array<Array<Hex>> = []

  moveDistrict(src: number, dst: number) {
    let color = this.hexMap.distColor[dst]
    let hexAry = this.districtHexAry[src]
    hexAry.forEach(hex => hex.setHexColor(color, dst))
    this.districtHexAry[dst] = hexAry
    delete this.districtHexAry[src]
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
    if (!!scaleC.stage.canvas) {
      Dragger.makeDragable(scaleC); // THE case where not "dragAsDispObj"
      scaleC.addChild(Dragger.dragCont); // so dragCont is in ScaleableContainer
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      let scale = this.scaleParams.initScale
      this.bindKeysToScale(scaleC, 600, 0, scale)
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
  bindKeysToScale(scaleC: ScaleableContainer, xos: number, yos: number, scale: number) {
    let xoff= scaleC.x, yoff = scaleC.y
    // set Keybindings to reset Scale:
    let resetScaleX = () => {
      scaleC.scaleContainer(0, {x: xoff, y: yoff}); // resetXY
      scaleC.stage.update();
    };
    let resetScale1 = () => {
      let ns = .244
      scaleC.scaleContainer(0, {x: xoff + xos*scale, y: yoff}); // resetXY
      scaleC.setScaleIndex(scaleC.findIndex(ns))
      scaleC.stage.update();
    };
    let resetScaleA = () => {
      let ns = .5
      scaleC.scaleContainer(0, {x: xoff + xos*scale, y: yoff - yos*scale}); // resetXY
      scaleC.setScaleIndex(scaleC.findIndex(ns))
      scaleC.stage.update();
    };
    // Scale-setting keystrokes:
    KeyBinder.keyBinder.globalSetKeyFromChar("x", { thisArg: this, func: resetScaleX });
    KeyBinder.keyBinder.globalSetKeyFromChar("z", { thisArg: this, func: resetScale1 });
    KeyBinder.keyBinder.globalSetKeyFromChar("a", { thisArg: this, func: resetScaleA });
  }
}