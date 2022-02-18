import { Stage, EventDispatcher, Container, Shape } from "createjs-module";
import { C, HexDir, RC, S, XY } from "./basic-intfs";
import { Dragger, DragInfo } from "./dragger";
import { GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder } from "./key-binder";
import { ScaleableContainer } from "./scaleable-container";
import { BoardStats, StatsPanel } from "./stats";
import { TP, StoneColor, stoneColors, otherColor } from "./table-params";
import { stime } from "./types";

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
  dropTarget: Hex;
  roundNumber: number = 0;
  turnNumber: number = 0
  dropStone: Stone
  nextHex: Hex = new Hex("grey", Stone.radius, undefined, undefined, {x: Stone.radius * 3, y: Stone.radius})

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
  }

  scaleParams = { zscale: .20, initScale: .324, zero: 0.125, max: 30, limit: 4, base: 1.1, min: -2 };
  testoff: number = 1
  markHex00() {
    // transparent Hex@[0,0] with black outline on markCont; but remove other references:
    let tc = Hex.borderColor; Hex.borderColor = C.black
    let h00 = this.makeDistrict(1, 0, 0, 0)[0]; h00.setHexColor("rgba(1,1,1,0)"); this.hexMap.markCont.addChild(h00)
    Hex.borderColor = tc
    delete this.hexMap[0][0] // make un-linkable
    this.districtHexAry = []
    console.log(`------------------------------------`)
  }
  layoutTable() {
    let radius = Stone.radius
    this.scaleCont = this.makeScaleCont(!!this.stage) // scaleCont & background
    let mapCont = new Container();
    mapCont[S.aname] = "mapCont"
    this.scaleCont.addChild(mapCont)

    this.hexMap = new HexMap(radius, mapCont)
    this.hexMap.hexCont.addChild(this.nextHex)  // single Hex to hold a Stone to play
    this.gamePlay.hexMap = this.hexMap
    this.markHex00()
    this.makeAllDistricts(TP.mHexes, TP.nHexes) // typically: 3,3 or 2,4
    let findMetaHex00 = (): Hex => {
      if (!TP.spiralHex) {
      this.moveDistrict(TP.mHexes, 0)
      this.moveDistrict(this.districtHexAry.length-1, TP.mHexes)
      this.districtHexAry.pop() // delete last element
      }
      return this.districtHexAry[0][TP.nHexes-1]
    }
    // background sized for nHexes:
    let hex00 = findMetaHex00(), r0=hex00.row, c0=hex00.col
    let mh = TP.mHexes, nh= TP.nHexes, high = hex00.height * 1.5, wide = hex00.width * 2.0
    let minc = c0 - c0 - Math.abs((nh+1)%2), minr = r0 - c0 - Math.floor(nh/1.5 + mh -2)
    let maxc = c0 + c0 + Math.abs((nh+1)%2), maxr = r0 + c0 + Math.floor(nh/1.5 + mh -2)
    let miny = --minr * high, maxy = ++maxr * high
    let minx = --minc * wide, maxx = ++maxc * wide
    this.bgRect = { x: 0, y: 0, w: (maxx - minx), h: (maxy - miny) }

    Dragger.makeDragable(this.nextHex, undefined, undefined, undefined, true)
    this.nextHex.x = minx + 2*wide ; this.nextHex.y = miny+ 2*high;
    if (TP.nHexes <= 2) { this.bgRect.w += 400; this.nextHex.x -= 3*wide; minx -= 2*high }
    // console.log({hex: hex0.Aname, x0, y0, x00, y00}, this.bgRect)
    console.log({minx, miny, maxx, maxy}, {minr, maxr, minc, maxc}, this.bgRect)
    // console.log(this.districtHexAry)
    this.setBackground(this.scaleCont)
    // align center of hexMap with center of background
    mapCont.x = this.bgRect.x + (this.bgRect.w) / 2 - hex00.x
    mapCont.y = this.bgRect.y + (this.bgRect.h) / 2 - hex00.y
    console.log({mapx: mapCont.x, mapy: mapCont.y, hex00x: hex00.x, hex00y: hex00.y})

    // console.log(`------------------------------------`)
    // this.makeAllDistricts(TP.nHexes-1, {x: 8*TP.nHexes*50, y: 0}) // 3 .. to the right
    //for (let ndx=TP.mHexes+1; ndx<14; ndx++) {this.makeDistrict(TP.nHexes, ndx%6+1, 1, ndx)}
    this.makeAllPlayers()
    this.setNextPlayer(0)   // make a placeable Stone for Player[0]
    this.bStats = new BoardStats(this)

    this.on(S.add, this.gamePlay.addStoneEvent, this.gamePlay)[S.aname] = "addStone"
    this.on(S.remove, this.gamePlay.removeStoneEvent, this.gamePlay)[S.aname] = "removeStone"
    this.stage.update()
  }
  setNextPlayer(ndx: number = -1, turn?: number) {
    if (ndx < 0) ndx = (this.curPlayer.index + 1) % this.allPlayers.length;
    if (ndx != this.curPlayerNdx) this.endCurPlayer(this.curPlayer)
    this.curPlayerNdx = ndx;
    this.turnNumber = turn ? turn : this.turnNumber + 1;
    this.roundNumber = Math.floor((this.turnNumber - 1) / this.allPlayers.length) + 1

    let lm = this.gamePlay.history[0], lms = !!lm? lm.toString(): ""
    let curPlayer = this.curPlayer = this.allPlayers[ndx], tn = this.turnNumber, capd = this.gamePlay.lastCaptured
    let info = { turn: tn, plyr: curPlayer.name, prev: lms, capd: capd, undo: this.gamePlay.undoRecs }
    console.log(stime(this, `.setNextPlayer ---------------`), info, '-----------------------------', !!this.stage.canvas);
    this.putButtonOnPlayer(curPlayer);
  }
  endCurPlayer(player: Player) {
    Dragger.stopDragable(this.dropStone) // whereever it landed
    let stone: Stone = this.nextHex.stone
    if (!!stone) {
      stone.parent.removeChild(stone)
      this.hexMap.update()
    }
  }
  putButtonOnPlayer(player: Player) {
    this.setStone(new Stone(player.color)) // new Stone for Player

    let color = otherColor(player.color)
    let attacks = this.hexMap.filterEachHex(hex => hex.isAttack(color)).map(h => h.Aname)
    console.log(stime(this, `.putButtonOnPlayer:${player.color}`), attacks)
    this.hexMap.update()
  }
  /** set hex.stone & addChild,  */
  setStone(stone: Stone, hex: Hex = this.nextHex, cont: Container = this.hexMap.stoneCont) {
    let pt = hex.parent.localToLocal(hex.x, hex.y, cont)
    stone.x = pt.x; stone.y = pt.y
    cont.addChild(stone)
    hex.stone = stone
    if (hex == this.nextHex) Dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
  }
  /** clear hex.stone & removeChild */
  clearStone(hex: Hex): Stone {
    let stone = hex.stone
    if (stone) {
      stone.parent.removeChild(stone)
      hex.stone = undefined
    }
    return stone
  }
  dragFunc(stone: Stone, ctx: DragInfo) {
    if (stone.color !== this.curPlayer.color) return
    let pt = stone.parent.localToLocal(stone.x, stone.y, this.hexMap.hexCont)
    let x = pt.x, y = pt.y
    if (ctx.first) {
      // ctx.lastCont == stone.parent == hexMap.stoneCont (putButtonOnPlayer & nextStone)
      this.hexMap.showMark()
    } else {
      let hex = this.hexMap.hexUnderPoint(x, y)
      if (!hex) return
      if (!!hex.captured) return
      if (!!hex.stone && hex.stone != stone) return // Ok to drop on itself
      this.dropTarget = hex // hex.parent == hexMap.hexCont
      this.hexMap.showMark(hex)
    }
  }
  dropFunc(stone: Stone, ctx: DragInfo) {
    // stone.parent == hexMap.stoneCont
    this.dropStone = stone
    let mark = this.hexMap.mark
    if (!mark.visible) return
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
    let dirs: HexDir[] = ['SE', 'S', 'SW', 'NW', 'N', 'NE']
    this.makeDistrict(nh, district++, mrc.row, mrc.col, xy)
    for (let ring = 1; ring < mh; ring++) {
      mrc.row -= 1 // start to North
      dirs.forEach(dir => {
        // newMetaHexesOnLine(ring, rc, dir, district, dcolor, hexAry, xy)
        for (let i = 0; i < ring; i++) {
          this.makeDistrict(nh, district++, mrc.row, mrc.col, xy)
          mrc = this.hexMap.nextRowCol(mrc, dir, this.hexMap.nsTopo(mrc))
        }
      })
    }
    console.log(this.districtHexAry)
  }
  makeDistrict(nh: number, district: number, mr, mc, xy?: XY): Hex[] {
    return TP.spiralHex ? this.makeSpiralDistrict(nh, district, mr, mc, xy) : this.makeLinearDistrict(nh, district, mr, mc, xy)
  }
  makeSpiralDistrict(nh: number, district: number, mr, mc, xy?: XY): Hex[] {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2*nh-1 
    let dcolor = (district == 0) ? 0 : (1 + ((district+nh+mr) % 6))
    // irow-icol define topology of MetaHex composed of HexDistrict 
    // [spiral defines topo of basic HexDistrict]
    let irow = (mr, mc) => { 
      let ir = mr * dia - nh * (mcp+1) + 1
      ir -= Math.floor((mc)/2)              // - half a row for each metaCol
      return ir
    }
    let icol = (mr, mc, row) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh*3 -1)/2))
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col 
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    let row0 = irow(mr, mc), col0 = icol(mr, mc, row0), hex: Hex;
    let hexAry = []; hexAry['Mr'] = mr; hexAry['Mc'] = mc; this.districtHexAry[district] = hexAry
    hexAry.push(hex = this.hexMap.addHex(row0, col0, district, dcolor, xy)) // The *center* hex
    let rc: RC = hex //{row: hex.row, col: hex.col} == {row0, col0}
    console.groupCollapsed(`makeSpiralDistrict [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}:${district}-${dcolor}`)
    console.log(`.makeSpiralDistrict: [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}`, hex)
    for (let ring = 1; ring < nh; ring++) {
      rc.col -= 1 // step West to start a ring
      // place 'ring' hexes along each axis-line:
      S.dirs.forEach(dir => rc = this.newHexesOnLine(ring, rc, dir, district, dcolor, hexAry, xy))
    }
    console.groupEnd()
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
  newHexesOnLine(n, rc: RC, dir: HexDir, district: number, dcolor: number, hexAry: Hex[], xy?: XY): RC {
      //let dcolor = this.hexMap.distColor[district]
      let hex: Hex
      //hexAry.push(hex = this.hexMap.addHex(row, col-1, district, district, xy))
      for (let i = 0; i< n; i++) { 
        hexAry.push(hex = this.hexMap.addHex(rc.row, rc.col, district, dcolor, xy))
        console.log(`.makeSpiralDistrict: [${hex.Aname}] hex=`, hex)
        rc = this.hexMap.nextRowCol(hex, dir)
      }
      return rc
    }
  /** Array of Hex for each District */
  districtHexAry: Array<Array<Hex>> = []
  /** left most [row,col] goes in [roff,coff] 
   * @param nh number of hexes on a side
   */
  makeLinearDistrict(nh: number, district: number, mr, mc, xy?: XY): Hex[] {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2*nh-1, dcolor = 1 + ((district+nh+mr) % 6)
    let irow = (mr, mc) => { 
      let ir = mr * dia - nh * (mcp+1) + 1
      ir -= Math.floor((mc)/2)              // - half a row for each metaCol
      return ir
    }
    let icol = (mr, mc, row) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh*3 -1)/2))
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col 
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    let row = irow(mr, mc), col = icol(mr, mc, row)
    let hexAry = []; hexAry['Mr'] = mr; hexAry['Mc'] = mc
    let rp = Math.abs(row % 2), cp = Math.abs(col % 2)
    console.log(`.makeLinearDistrict(${nh}, ${district} [${mr}, ${mc}] = (${row},${col}))`)
    for (let dr = 0; dr < nh; dr++) {
      let c0 = col + ((rp == 0) ? Math.floor(dr/2) : Math.ceil(dr/2))
      let len = (2 * nh - 1) - dr
      for (let dc = 0; dc < len; dc++) {
        hexAry.push(this.hexMap.addHex(row + dr, c0 + dc, district, dcolor, xy))
        if (dr !== 0) hexAry.push(this.hexMap.addHex(row - dr, c0 + dc, district, dcolor, xy))
      }
    }
    return this.districtHexAry[district] = hexAry
  }
  moveDistrict(src, dst) {
    let color = this.hexMap.distColor[dst]
    let hexAry = this.districtHexAry[src]
    hexAry.forEach(hex => hex.setHexColor(color, dst))
    this.districtHexAry[dst] = hexAry
    delete this.districtHexAry[src]
  }
  bgRect = {x: 0, y: 0, w: 2000, h: 2000}
  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
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
  setBackground(scaleC: Container, bgColor: string = TP.bgColor) {
    if (!!bgColor) {
      // specify an Area that is Dragable (mouse won't hit "empty" space)
      let background = new Shape();
      background.graphics.beginFill(bgColor).drawRect(this.bgRect.x, this.bgRect.y, this.bgRect.w, this.bgRect.h);
      scaleC.addChildAt(background, 0);
      background.x = 0;
      background.y = 0;
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