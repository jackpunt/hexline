import { Stage, EventDispatcher, Container, Shape } from "createjs-module";
import { C, S, XY } from "./basic-intfs";
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
  hex00: Hex
  
  layoutTable() {
    let radius = Stone.radius
    this.scaleCont = this.makeScaleCont(!!this.stage) // scaleCont & background
    let mapCont = new Container(); mapCont.y = 100; mapCont.x = 200
    mapCont[S.aname] = "mapCont"
    this.scaleCont.addChild(mapCont)

    this.hexMap = new HexMap(radius, mapCont)
    this.hexMap.hexCont.addChild(this.nextHex)  // single Hex to hold a Stone to play
    Dragger.makeDragable(this.nextHex, undefined, undefined, undefined, true)
    this.gamePlay.hexMap = this.hexMap
    //this.makeDistrict(1, 0, 0, 0, 0, 0);
    //console.log(`------------------------------------`)
    this.make7Districts(TP.mHexes) // typically: 3
    // background sized for nHexes:
    let minx, miny = minx = 99999, minDx, minDy;
    let maxx, maxy = maxx = -99999, maxDx, maxDy;
    this.districtHexAry.forEach((dHexAry, dNdx) => dHexAry.forEach(hex => {
      if (hex.x < minx) { minx = hex.x; minDx = dNdx }
      if (hex.y < miny) { miny = hex.y; minDy = dNdx }
      if (hex.x > maxx) { maxx = hex.x; maxDx = dNdx }
      if (hex.y > maxy) { maxy = hex.y; maxDy = dNdx }
    })) 
    let border = 2 * Stone.radius
    minx -= border; maxx+=border; miny-=border; maxy+=border
    let hex0 = this.hex00
    // let hex0 = this.districtHexAry[0][TP.nHexes-1]  // center Hex in central district
    let x0= hex0.x, y0 = hex0.y, dim = (hex0.y + hex0.height * 2) * 2 
    let x00 = (minx+maxx)/2, y00 = (miny+maxy)/2
    this.bgRect = { x: 0, y: 0, w: dim, h: dim }
    this.bgRect = { x: minx, y: miny, w: (maxx - minx), h: (maxy - miny) }
    if (TP.nHexes <= 2) { this.bgRect.w += 300; this.nextHex.x -= 200; minx -= 100 }
    console.log({hex: hex0.Aname, x0, y0, x00, y00}, this.bgRect)
    console.log({minx, miny, maxx, maxy}, this.bgRect, {minDx, minDy, maxDx, maxDy})
    console.log(this.districtHexAry)
    this.setBackground(this.scaleCont)
    // align center of hexMap with center of background
    mapCont.x = (this.bgRect.x + this.bgRect.w) / 2 - x0 //(maxx + minx) / 2
    mapCont.y = (this.bgRect.y + this.bgRect.h) / 2 - y0 - TP.nHexes*border/2 //(maxy + miny) / 2
    //mapCont.x = minx-border/2 
    //mapCont.y = miny+2*border + border/2

    // console.log(`------------------------------------`)
    // this.make7Districts(TP.nHexes-1, {x: 8*TP.nHexes*50, y: 0}) // 3 .. to the right

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
   * @param n number of hexes on a side, also: number of layers of meta-hexes
   * @param xy (graphical display offset)
   */
  make7Districts(n: number, xy?: XY) {
    let col = Math.ceil(n/2), row = 0, rp = Math.abs(row % 2), cp = Math.abs(col % 2), district = 0
    let hex00: Hex, dist = 0
    for (let dc = 0; dc < n; dc++) {
      let r0 = row + ((cp == 1) ? Math.floor(dc/2) : Math.ceil(dc/2))
      let len = (2*n - 1) - dc
      for (let dr = 0; dr < len; dr++) {
        this.makeDistrict(TP.nHexes, dist++, r0 + dr, col + dc, xy)
        if (dc !== 0) this.makeDistrict(TP.nHexes, dist++, r0 + dr, col - dc, xy)
      }
    }

  }
  /** Array of Hex for each District */
  districtHexAry: Array<Array<Hex>> = []
  /** left most [row,col] goes in [roff,coff] 
   * @param n number of hexes on a side
   */
  makeDistrict(n: number, district: number, mr, mc, xy?: XY) {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2*n-1, dcolor = district % 7
    let irow = (mr, mc) => { 
      let ir
      ir = n * (2 * mr - 1 - mcp) - (mr-1) // 2*mr -1 (or -2 for odd mc)
      ir = mr * (2*n-1) - n * (mcp+1) + 1
      ir = mr * dia - n * (mcp+1) + 1
      ir -= Math.floor((mc)/2)  // - half a row for each mc
      //console.log(`.makeDistrictIR(${n}, ${district} [${mc}, ${mr}] = (${ir} ${roff}, ${coff}))`)
      return ir
    }
    let icol = (mr, mc, row) => {
      let ic, np = Math.abs(n % 2), rp = Math.abs(row % 2)
      let ic0 = Math.floor(mc * ((n*3 -1)/2)) - Math.floor((mc+np)/4)
      ic = ic0 + Math.floor((mr-rp)/2) // 
      //if (mr == 1)console.log(`.makeDistrictIC(${n}, ${district} [${mc}, ${mr}] = (${row}, ${ic0}, ${Math.floor((mr-rp)/2)}, ${ic}))`)
      return ic
    }
    let row = irow(mr, mc)+(n-1), col = icol(mr, mc, row)
    let hexAry = []; hexAry['Mr'] = mr; hexAry['Mc'] = mc
    let rp = Math.abs(row % 2), cp = Math.abs(col % 2)
    console.log(`.makeDistrict(${n}, ${district} [${mr}, ${mc}] = (${row},${col}))`)
    for (let dr = 0; dr < n; dr++) {
      let c0 = col + ((rp == 0) ? Math.floor(dr/2) : Math.ceil(dr/2))
      let len = (2*n - 1) - dr
      for (let dc = 0; dc < len; dc++) {
        hexAry.push(this.hexMap.addHex(row + dr, c0 + dc, district, dcolor, xy))
        if (dr !== 0) hexAry.push(this.hexMap.addHex(row - dr, c0 + dc, district, dcolor, xy))
        if (mr == TP.mHexes-1 && dr == 0 && dc == n-1 && !this.hex00) this.hex00 = hexAry[hexAry.length -1]
      }
    }
    this.districtHexAry[district] = hexAry
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
      this.bindKeysToScale(scaleC, 400, 0, scale)
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