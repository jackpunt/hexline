import { Container, DisplayObject, Graphics, Shape, Text } from "@thegraid/easeljs-module";
import { C, F, RC, S, stime } from "@thegraid/easeljs-lib";
import { HexAxis, HexDir, H, InfDir, EwDir, NsDir } from "./hex-intfs";
import { Stone } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColor1, StoneColorRecord, stoneColorRecord, stoneColorRecordF, stoneColors, TP } from "./table-params";
import { GamePlay0 } from "./game-play";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip'
export type IHex = { Aname: string, row: number, col: number }

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

type LINKS = { [key in InfDir]?: Hex }
type INF   = { [key in InfDir]?: number }
type INFM   = { [key in HexAxis]?: InfMark }
type TopoEW = { [key in EwDir] }
type TopoNS = { [key in NsDir] }
type Topo = TopoEW | TopoNS

export type HexMaps = HexMap | HexMapLayer
export type HSC = { hex: Hex, sc: StoneColor, Aname?: string }
export function newHSC(hex: Hex, sc: StoneColor, Aname?: string) { return { Aname, hex, sc } }
class InfMark extends Shape {
  /** Note: requires a Canvas for nameToRgbaString() */
  static gColor(sc: StoneColor, g: Graphics = new Graphics()) {
    let alpha = '.85'
    let lightgreyA = C.nameToRgbaString('lightgrey', '.5')
    let r = Stone.height - 1, w = 5, wo = w / 2, wos = sc === stoneColor0 ? wo : -wo
    let c = TP.colorScheme[sc]; c = C.nameToRgbaString(c, alpha)

    let gStroke = (g: Graphics, color: string, w: number, wo: number, r: number) => {
      return g.ss(w).s(color).mt(wo, r).lt(wo, -r)
    }
    g.clear()
    if (C.dist(c, "white") < 10) gStroke(g, lightgreyA, w + 2, wos, r) // makes 'white' more visible
    if (C.dist(c, "black") < 10) w -= 1 // makes 'black' less bold
    gStroke(g, c, w, wos, r)
    return g
  }
  /** 2 Graphics, one is used by each InfMark */
  static infG = stoneColorRecord(undefined as Graphics, undefined as Graphics)
  static setInfGraphics(): StoneColorRecord<Graphics> {
    return InfMark.infG = stoneColorRecordF<Graphics>(sc => InfMark.gColor(sc, InfMark.infG[sc]))
  }
  /** @param ds show Influence on Axis */
  constructor(sc: StoneColor, ds: HexAxis, x: number, y: number) {
    super(InfMark.infG[sc] || InfMark.setInfGraphics()[sc])
    this.mouseEnabled = false
    this.rotation = H.dirRot[ds]
    this.x = x; this.y = y
    this[S.Aname] = `Inf[${TP.colorScheme[sc]},${ds},${this.id}]`  // for debug, not production
  }
}
class CapMark extends Shape {
  static capSize = 4   // depends on HexMap.height
  constructor(hex: Hex2) {
    super()
    this.paint()
    hex.cont.parent.localToLocal(hex.x, hex.y, hex.map.mapCont.markCont, this)
  }
  paint() {
    this.graphics.c().f(Hex.capColor).dp(0, 0, CapMark.capSize, 6, 0, 30)
  }
}

/** to recognize this class in hexUnderPoint and obtain the contained Hex. */
class HexCont extends Container {
  constructor(public hex: Hex2) {
    super()
  }
}


/** Base Hex, has no connection to graphics.
 * 
 * (although an InfMark contains a graphics)
 */
export class Hex {
  static capColor = H.capColor1 // dynamic set
  constructor(map: HexMaps, row?: number, col?: number, name = `Hex@[${row},${col}]`) {
    this.Aname = name
    this.map = map
    this.row = row
    this.col = col
    this.links = {}
  }
  /** (x,y): center of hex; (width,height) of hex; scaled by radius if supplied */
  xywh(row = this.row, col = this.col, radius = 1) {
    let w = radius * H.sqrt3, h = radius * 1.5
    let x = w * col + w * Math.abs(row % 2) / 2
    let y = h * row
    return [x, y, w, h]
  }
  readonly Aname: string
  /** color of current Stone on this Hex (or undefined) */
  stoneColor: StoneColor = undefined;

  /** compute ONCE, *after* HexMap is populated with all the Hex! */
  get rc_linear(): number { return this._rcLinear || (this._rcLinear = this.map.rcLinear(this.row, this.col))}
  _rcLinear: number = undefined
  /** accessor so Hex2 can override-advise */
  _district: number // district ID
  get district() { return this._district }
  set district(d: number) {
    this._district = d
  }
  readonly map: HexMaps;  // Note: this.parent == this.map.hexCont [cached]
  readonly row: number
  readonly col: number
  readonly inf = stoneColorRecord<INF>({},{})
  /** Link to neighbor in each H.dirs direction [NE, E, SE, SW, W, NW] */
  readonly links: LINKS = {}
  metaLinks: LINKS;           // defined only for hex0 (the center Hex of a district)

  /** set hex.stoneColor and push HSC on allStones */
  setColor(stoneColor: StoneColor): Hex {
    if (this.stoneColor !== undefined) {
      console.warn(`hex already occupied ${this.Aname}: ${stoneColor} -> ${this.stoneColor}`)
      debugger; // hex already occupied
    }
    this.stoneColor = stoneColor
    //let hexm = new HexMapLayer(this.map, this, stoneColor)
    //let hex = hexm.addHex(this)
    let hsc: HSC = newHSC(this, stoneColor, this.Aname)
    this.map?.allStones.push(hsc) // no push: Aname == nextHex
    return this
  }
  clearColor(): StoneColor {
    let color = this.stoneColor, hscAry = this.map.allStones
    if (color !== undefined && this.map !== undefined) {
      // put filtered result back into original array:
      hscAry.splice(0, hscAry.length,...hscAry.filter(hsc => hsc.hex !== this))
    }
    this.stoneColor = undefined
    return color
  }
  toString(stoneColor = this.stoneColor) {
    return `${TP.colorScheme[stoneColor]}${this.Aname.substring(3)}`
  }

  /**
   * Is this Hex [already] influenced by color/dn? [for skipAndSet()]
   * @param color StoneColor
   * @param dn dir of Influence: ds | revDir[ds]
   * @returns true if Hex is StoneColor or has InfMark(color, dn)
   */
  isInf(color: StoneColor, dn: InfDir) { return this.inf[color][dn] > 0}
  getInf(color: StoneColor, dn: InfDir) { return this.inf[color][dn] || 0 }
  setInf(color: StoneColor, dn: InfDir, inf: number) { return this.inf[color][dn] = inf }

  /** 
   * @param inc is influence *passed-in* to Hex; hex get [inc or inc+1]; *next* gets [inc or inc-1]
   */
  propagateIncr(color: StoneColor, dn: InfDir, inc: number, test?: (hex: Hex) => void) {
    let inf = this.stoneColor === color ? inc + 1 : inc // inc >= 0, inf > 0
    this.setInf(color, dn, inf)
    let nxt = this.stoneColor === color ? inf : inf - 1
    if (nxt > 0) this.links[dn]?.propagateIncr(color, dn, nxt, test)
    test && test(this)
  }
  /**
   * Pass on based on *orig/current* inf, not the new/decremented inf.
   * @param inc is influence *passed-in* from prev Hex; *this* gets inc; pass-on [inc or inc-1]
   */
  propagateDecr(color: StoneColor, dn: InfDir, inc: number, test?: (hex: Hex) => void) {
    let inf = this.getInf(color, dn)
    let infn = this.stoneColor === color ? inc + 1 : inc
    this.setInf(color, dn, infn)
    let nxt = this.stoneColor === color ? infn : Math.max(0, infn - 1)
    if (inf > 0) this.links[dn]?.propagateDecr(color, dn, nxt, test) // pass-on a smaller number
    test && test(this)
  }

  /** create empty INF for each color */
  clearInf() { stoneColors.forEach(c => this.inf[c] = {}) }

  /** true if hex influence by 1 or more Axies of color */
  isThreat(color: StoneColor) {
    return !!Object.values(this.inf[color]).find(inf => (inf > 0))
  }
  isAttack2(color: StoneColor) {
    let attacks = 0, infs = this.inf[color], adds = {}
    H.axis.forEach(ds => adds[ds] = 0)
    return !!Object.entries(infs).find(([dn, inf]) =>
      (inf > 0) && (++adds[H.dnToAxis[dn]] == 1) && (++attacks >= 2)
    )
  }
  /** @return true if Hex is influenced on 2 or more Axies of color */
  isAttack(color: StoneColor): boolean {
    let attacks = new Set<HexAxis>(), infs = this.inf[color]
    return !!Object.entries(infs).find(([dn, inf]) => 
      (inf > 0) && (attacks.add(H.dnToAxis[dn]).size >= 2)
    )
  }
  /** @return true if Hex has a Stone (of other color), and is attacked */
  isCapture(color: StoneColor): boolean {
    return (this.stoneColor !== undefined) && (this.stoneColor !== color) && this.isAttack(color)
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: InfDir): Hex {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds])) { hex = nhex }
    return hex    
  }
  /** distance between Hexes: adjacent = 1 */
  radialDist(hex: Hex): number {
    let [tx, ty, tw] = this.xywh(), [hx, hy] = hex.xywh()
    let dx = tx-hx, dy = ty - hy
    return Math.sqrt(dx*dx + dy*dy)/tw // tw == H.sqrt3
  }
  /** @return corresonding Hex on other map */
  ofMap(otherMap: HexMaps): Hex {
    return Hex.ofMap(this, otherMap)
  }
  /** return indicated Hex from otherMap */
  static ofMap(hex: IHex, otherMap: HexMaps) {
    return (hex.Aname === S_Skip) ? otherMap.skipHex
      : (hex.Aname === S_Resign) ? otherMap.resignHex
        : otherMap[hex.row][hex.col]
  }
  /** reduce to serializable IHex (removes map, inf, links, etc) */
  get toIHex() { return { Aname: this.Aname, row: this.row, col: this.col } }

}
/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex2 extends Hex {
  // cont holds hexShape(color), rcText, distText, capMark
  cont: HexCont = new HexCont(this) // Hex IS-A Hex0, HAS-A Container

  get x() { return this.cont.x}
  set x(v: number) { this.cont.x = v}
  get y() { return this.cont.y}
  set y(v: number) { this.cont.y = v}
  get scaleX() { return this.cont.scaleX}
  get scaleY() { return this.cont.scaleY}

  // if override set, then must override get!
  override get district() { return this._district }
  override set district(d: number) {
    this._district = d    // cannot use super.district = d [causes recursion, IIRC]
    this.distText.text = `${d}`
  }
  readonly radius: number;   // determines width & height
  hexShape: Shape   // shown on this.cont: colored hexagon
  distColor: string // district color of hexShape (paintHexShape)
  capMark: CapMark; // shown on this.map.markCont
  distText: Text    // shown on this.cont
  rcText: Text      // shown on this.cont
  stone: Stone      // shown on this.map.stoneCont
  stoneIdText: Text     // shown on this.map.markCont
  infm: Record<StoneColor,INFM> = stoneColorRecord({},{})

  /** Hex2 cell with graphics; shown as a polyStar Shape of radius @ (XY=0,0) */
  constructor(map: HexMaps, row?: number, col?: number, name?: string) {
    super(map, row, col, name);
    map.mapCont.hexCont.addChild(this.cont)
    this.radius = Stone.radius
  
    this.setHexColor("grey")  // until setHexColor(by district)
    this.stoneIdText = new Text('', F.fontSpec(26))
    this.stoneIdText.textAlign = 'center'; this.stoneIdText.regY = -20

    if (row === undefined || col === undefined) return
    let [x, y, w, h] = this.xywh(row, col, this.radius)
    this.x += x
    this.y += y
    this.cont.setBounds(-w/2, -h/2, w, h)

    let rc = `${row},${col}`, tdy = -25
    this.hexShape.name = this.Aname

    let rct = this.rcText = new Text(rc, F.fontSpec(26)); // radius/2 ?
    rct.textAlign = 'center'; rct.y = tdy // based on fontSize? & radius
    this.cont.addChild(rct)

    this.distText = new Text(``, F.fontSpec(20)); 
    this.distText.textAlign = 'center'; this.distText.y = tdy + 46 // yc + 26+20
    this.cont.addChild(this.distText)
    this.showText(true)
  }
  /** set visibility of rcText & distText */
  showText(vis = !this.rcText.visible) {
    this.rcText.visible = this.distText.visible = vis
  }
  override setInf(color: StoneColor, dn: InfDir, inf: number): number {
    super.setInf(color, dn, inf)
    this.showInf(color, dn, (this.stoneColor !== color && (inf > 0 || this.isInf(color, H.dirRevEW[dn]))))
    return inf
  }
  static infVis = true   // set by ParamGui('showInf')
  showInf(color: StoneColor, dn: InfDir, show = true) {
    let ds: HexAxis = H.dnToAxis[dn], infMark = this.infm[color][ds]  // infm only on [ds]
    if (show) {
      if (!infMark) {
        infMark = this.infm[color][ds] = new InfMark(color, ds, this.x, this.y)
        this.map.mapCont.infCont.addChild(infMark)
      }
      infMark.visible = Hex2.infVis
    } else {
      //infMark?.parent?.removeChild(infMark)
      infMark && (infMark.visible = false)
    }
  }
  override clearInf(): void {
    stoneColors.forEach(color => {
      for (let mark of Object.values(this.infm[color])) 
        //mark?.parent?.removeChild(mark)
        mark && (mark.visible = false)
    })
    super.clearInf()
  }

  /** make and show a CapMark on this Hex2 */
   markCapture() {
    if (this.capMark === undefined) { this.capMark = this.map.mapCont.markCont.addChild(new CapMark(this)) }
    else (this.capMark.paint())
    this.capMark.visible = true
  }
   unmarkCapture() {
    this.capMark && (this.capMark.visible = false) 
  }

  setStoneId(id: number | string) {
    let sid = typeof id === 'number' ? `${id}` : id
    this.stoneIdText.text = this.stoneIdText ? sid : ''
    this.stoneIdText.color = TP.Black_White[otherColor(this.stone.color)]
    let cont: Container = this.map.mapCont.stoneCont
    this.cont.parent.localToLocal(this.x, this.y, cont, this.stoneIdText)
    cont.addChild(this.stoneIdText)
  }
  clearStoneId() {
    this.stoneIdText?.parent?.removeChild(this.stoneIdText)
  }
  /** make a Stone on this Hex2 (from addStone(color)) */
  // setColor returns a new Hex2 on a new HexMap
  override setColor(stoneColor: StoneColor): Hex {
    let hex = super.setColor(stoneColor)
    if (stoneColor !== undefined) {
      let stone = this.stone = new Stone(stoneColor)
      stone[S.Aname] = `[${this.row},${this.col}]`
      let cont: Container = this.map.mapCont.stoneCont
      this.cont.parent.localToLocal(this.x, this.y, cont, stone)
      cont.addChild(stone)
    } // else this.clearColor() has been called
    return hex
  }
  /** removeChild(stone) & HSC from map.allStones. */
  override clearColor(): StoneColor {
    this.clearStoneId()
    this.stone?.parent?.removeChild(this.stone)
    this.stone = undefined
    return super.clearColor()
  }

  /** set hexShape using color */
  setHexColor(color: string, district?: number) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    this.distColor = color
    let hexShape = this.paintHexShape(color, this.hexShape)
    if (hexShape !== this.hexShape) {
      this.cont.removeChild(this.hexShape)
      this.cont.addChildAt(hexShape, 0)
      this.cont.hitArea = hexShape
      this.hexShape = hexShape
    }
  }
  /** makes a colored hex, outlined with bgColor */
  paintHexShape(color: string, ns = new Shape(), rad = this.radius): Shape {
    let tilt = 30
    ns.graphics.s(TP.borderColor).dp(0, 0, rad+1, 6, 0, tilt) // s = beginStroke(color) dp:drawPolyStar
    ns.graphics.f(color).dp(0, 0, rad, 6, 0, tilt)             // f = beginFill(color)
    //ns.rotation = H.dirRot[H.N]
  return ns
  }
  override lastHex(ds: InfDir): Hex {
    return super.lastHex(ds) as Hex
  }
}
export class MapCont extends Container {
  hexCont: Container     // hex shapes on bottom stats: addChild(dsText), parent.rotation
  stoneCont: Container   // Stone in middle      Hex2.setStoneId, setStoneColor [localToLocla]
  markCont: Container    // showMark over Stones new CapMark [localToLocal]
  infCont: Container     // infMark on the top   Hex2.showInf
}

export interface HexM {
  readonly allStones: HSC[]       // all the Hex with a Stone/Color
  readonly district: Hex[][]      // all the Hex in a given district
  readonly mapCont: MapCont
  rcLinear(row: number, col: number): number
  forEachHex<K extends Hex>(fn: (hex: K) => void): void // stats forEachHex(incCounters(hex))
  //used by GamePlay:
  readonly skipHex: Hex 
  readonly resignHex: Hex
  update(): void
  showMark(hex: Hex): void

}
/** 
 * Collection of Hex *and* Graphics-Containers for Hex2
 * allStones: HSC[] and districts: Hex[]
 * 
 * HexMap[row][col]: Hex or Hex2 elements. 
 * If mapCont is set, then populate with Hex2 
 * 
 * (TP.mh X TP.nh) hexes in districts; allStones: HSC[]
 * 
 * With a Mark and off-map: skipHex & resignHex
 * 
 */
export class HexMap extends Array<Array<Hex>> implements HexM {
  // A color for each District:
  static readonly distColor = ["lightgrey","limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

  /** Each occupied Hex, with the occupying StoneColor  */
  readonly allStones: HSC[] = []                    // aka hexStones in Board (readonly when we stop remove/filter)
  readonly district: Array<Hex[]> = []
  readonly mapCont: MapCont = new MapCont     // if using Hex2
  readonly skipHex: Hex;
  readonly resignHex: Hex;
  rcLinear(row: number, col: number): number { return col + row * (1 + this.maxCol - this.minCol) }

  mh: number
  nh: number
  radius: number = TP.hexRad
  /** height of hexagonal cell (1.5 * radius) */
  height: number = this.radius * 1.5;
  /** width of hexagonal cell  (H.sqrt3 * radius */
  width: number = this.radius * H.sqrt3
  mark: DisplayObject                              // a cached DisplayObject, used by showMark
  private minCol: number = undefined               // Array.forEach does not look at negative indices!
  private maxCol: number = undefined               // used by rcLinear
  private minRow: number = undefined               // not used at this time

  readonly metaMap = Array<Array<Hex>>()           // hex0 (center Hex) of each MetaHex, has metaLinks to others.

  /** bounding box: XYWH = {0, 0, w, h} */
  get wh() {
    let hexRect = this.mapCont.hexCont.getBounds()
    let wh = { width: hexRect.width + 2 * this.width, height: hexRect.height + 2 * this.width }
    return wh
  }
  /** for contrast paint it black AND white, leave a hole in the middle unpainted. */
  makeMark(radius: number, radius0: number = 0) {
    let mark = new Shape(), cb = "rgba(0,0,0,.3)", cw="rgba(255,255,255,.3)"
    mark.mouseEnabled = false
    mark.graphics.f(cb).dp(0, 0, radius, 6, 0, 30)
    mark.graphics.f(cw).dp(0, 0, radius, 6, 0, 30)
    mark.cache(-radius, -radius, 2*radius, 2*radius)
    mark.graphics.c().f(C.BLACK).dc(0, 0, radius0)
    mark.updateCache("destination-out")
    return mark
  }

  /** 
   * HexMap: TP.mh X TP.nh hexes in districts; with a Mark, an off-map: skipHex & resignHex 
   * @param addToMapcont use Hex2 for Hex, make Containers: hexCont, infCont, markCont, stoneCont
   */
  constructor(radius: number = TP.hexRad, addToMapCont = false) {
    super()
    this.radius = radius
    this.height = radius * H.sqrt3
    this.width = radius * 1.5
    CapMark.capSize = this.width/2
    this.skipHex = new Hex(this, undefined, undefined, S_Skip)
    this.resignHex = new Hex(this, undefined, undefined, S_Resign)
    if (addToMapCont) this.addToCont()
  }

  addToCont(): this {
    this.mark = this.makeMark(this.radius, this.radius/2.5)
    let mapCont = this.mapCont
    mapCont.hexCont = new Container()     // hex shapes on bottom
    mapCont.stoneCont = new Container()   // Stone in middle
    mapCont.markCont = new Container()    // showMark under Stones
    mapCont.infCont = new Container()     // infMark on the top
    // hexCont, stoneCont, markCont all x,y aligned
    mapCont.addChild(mapCont.hexCont); mapCont.hexCont[S.Aname] = "hexCont"
    mapCont.addChild(mapCont.stoneCont); mapCont.stoneCont[S.Aname] = "stoneCont"
    mapCont.addChild(mapCont.markCont); mapCont.markCont[S.Aname] = "markCont"
    mapCont.addChild(mapCont.infCont); mapCont.infCont[S.Aname] = "infCont"
    return this
  }

  initInfluence(): this { InfMark.setInfGraphics(); return this }

  update() { this.mapCont.hexCont.parent?.stage.update()}

  /** to build this HexMap: create Hex and link it to neighbors. */
  addHex(row: number, col: number, district: number ): Hex {
    // If we have an on-screen Container, then use Hex2: (addToCont *before* makeAllDistricts)
    let hex = !!this.mapCont.hexCont ? new Hex2(this, row, col) : new Hex(this, row, col)
    hex.district = district // and set Hex2.districtText
    if (this[row] === undefined) {
      this[row] = new Array<Hex>()
      if (this.minRow === undefined || row < this.minRow) this.minRow = row
    }
    if (this.minCol === undefined || col < this.minCol) this.minCol = col
    if (this.maxCol === undefined || col > this.maxCol) this.maxCol = col
    this[row][col] = hex   // addHex to this Array<Array<Hex>>
    this.link(hex)   // link to existing neighbors
    return hex
  }
  /** Array.forEach does not use negative indices: ASSERT [row,col] is non-negative (so 'of' works) */
  forEachHex<K extends Hex>(fn: (hex: K) => void) {
    // minRow generally [0 or 1] always <= 5, so not worth it
    //for (let ir = this.minRow || 0; ir < this.length; ir++) { 
    for (let ir of this) {
      // beginning and end of this AND ir may be undefined
      if (ir !== undefined) for (let hex of ir) { hex !== undefined && fn(hex as K) }
    }
  }
  findHex<K extends Hex>(fn: (hex: K) => boolean): K {
    let found: K
    for (let ir of this) {
      if (ir === undefined) continue
      found = ir.find((hex: K) => fn(hex)) as K
      if (found !== undefined) return found
    }
    return found // undefined
  }
  mapEachHex<K extends Hex,T>(fn: (hex: K) => T): T[] {
    let rv: T[] = []
    this.forEachHex<K>(hex => rv.push(fn(hex)))
    return rv
  }
  filterEachHex<K extends Hex>(fn: (hex: K) => boolean): K[] {
    let rv: K[] = []
    this.forEachHex<K>(hex => fn(hex) && rv.push(hex))
    return rv
  }
  /** make this.mark visible above this Hex */
  showMark(hex?: Hex) {
    let mark = this.mark
    if (!hex || hex.Aname === S_Skip || hex.Aname === S_Resign) {
      mark.visible = false
    } else if (hex instanceof Hex2) {
      mark.x = hex.x
      mark.y = hex.y
      mark.visible = true
      this.mapCont.markCont.addChild(mark) // show mark *below* Stone & infMark
    }
  }
  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  ewEvenRow: TopoEW = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }}
  ewOddRow: TopoEW = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: {dc: 0, dr: 1}, W: {dc: -1, dr: 0}, NW: {dc: 0, dr: -1}}
  nsOddCol: TopoNS = {
    NE: { dc: 1, dr: -1 }, SE: { dc: 1, dr: 0 }, S: { dc: 0, dr: 1 }, N: { dc: 0, dr: -1 },
    SW: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }}
  nsEvenCol: TopoNS = {
    NE: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 }, S: { dc: 0, dr: 1 }, N: { dc: 0, dr: -1 },
    SW: { dc: -1, dr: 1}, NW: { dc: -1, dr: 0 }}
  nsTopo(rc: RC): TopoNS { return (rc.col % 2 == 0) ? this.nsEvenCol : this.nsOddCol }
  ewTopo(rc: RC): TopoEW { return (rc.row % 2 == 0) ? this.ewEvenRow : this.ewOddRow}

  nextRowCol(hex: RC, dir: HexDir, nt: Topo = this.ewTopo(hex)): RC {
    let row = hex.row + nt[dir].dr, col = hex.col + nt[dir].dc 
    return {row, col}
  }
  addMetaHex(hex: Hex, mr: number, mc: number) {
    let metaMap = this.metaMap
    if (metaMap[mr] === undefined) metaMap[mr] = new Array<Hex>()
    metaMap[mr][mc] = hex   // addHex to this Array<Array<Hex>>
    this.metaLink(hex, {row: mr, col: mc})
  }
  /** link metaHex on metaMap; maybe need ewTopo for nh==1 ?? */
  metaLink(hex: Hex, rc: RC) {
    let nt = (this.nh == 0) ? this.ewTopo(rc) : this.nsTopo(rc)
    this.link(hex, rc, this.metaMap, nt, (hex) => hex.metaLinks)
  }
  /** link hex to/from each extant neighor */
  link(hex: Hex, rc: RC = hex, map: Hex[][] = this, nt: Topo = this.ewTopo(rc), lf: (hex: Hex) => LINKS = (hex) => hex.links) {
    let topoDirs = Object.keys(nt)
    topoDirs.forEach(dir => {
      let nr = rc.row + nt[dir].dr, nc = rc.col + nt[dir].dc //let {row, col} = this.nextRowCol(hex, dir, nt)
      let nHex = map[nr] && map[nr][nc]
      if (!!nHex) {
        lf(hex)[dir] = nHex
        lf(nHex)[H.dirRev[dir]] = hex
      }
    });
  }
  /**
   * The Hex under the given x,y coordinates.
   * If on the line, then the top (last drawn) Hex.
   * @param x in local coordinates of this HexMap.cont
   * @param y 
   * @returns the Hex under mouse or false, if not a Hex (background)
   */
  hexUnderPoint(x: number, y: number): Hex2 {
    let obj = this.mapCont.hexCont.getObjectUnderPoint(x, y, 1) // 0=all, 1=mouse-enabled (Hex, not Stone)
    return (obj instanceof HexCont) && obj.hex
  }
  /**
   * 
   * @param mh order [number of 'rings'] of meta-hexes (2 or 3 for this game) [TP.mHexes]
   * @param nh size ['rings' in each meta-hex] of meta-hex (1..6) [TP.nHexes]
   */
  makeAllDistricts(mh: number, nh: number) {
    this.mh = mh; this.nh = nh
    let hexMap = this, district = 0
    let mrc: RC = { col: Math.ceil((mh+1) / 2), row: Math.floor(mh*1.25) } // row,col to be non-negative
    let dirs: HexDir[] = ['NE', 'SE', 'S', 'SW', 'NW', 'N',] // N-S aligned!
    let hexAry = this.makeDistrict(nh, district++, mrc.row, mrc.col) // Central District [0]
    for (let ring = 1; ring < mh; ring++) {
      //mrc.row -= 1 // start to North
      mrc = hexMap.nextRowCol(mrc, 'NW', hexMap.nsTopo(mrc)) // NW + NE => 'N' for next metaHex
      dirs.forEach(dir => {
        for (let i = 0; i < ring; i++) {
          mrc = hexMap.nextRowCol(mrc, dir, hexMap.nsTopo(mrc))
          hexAry = this.makeDistrict(nh, district++, mrc.row, mrc.col)
        }
      })
    }
    this.mapCont.hexCont && this.centerOnContainer()
  }
  centerOnContainer() {
    let mapCont = this.mapCont
    let hexRect = mapCont.hexCont.getBounds()
    mapCont.hexCont.x = mapCont.markCont.x = mapCont.stoneCont.x = mapCont.infCont.x = -(hexRect.x + hexRect.width/2)
    mapCont.hexCont.y = mapCont.markCont.y = mapCont.stoneCont.y = mapCont.infCont.y = -(hexRect.y + hexRect.height/2)
  }

  pickColor(hexAry: Hex2[]): string {
    let hex = hexAry[0]
    let adjColor: string[] = [HexMap.distColor[0]] // colors not to use
    H.dirs.forEach(hd => {
      let nhex: Hex2 = hex
      while (!!(nhex = nhex.links[hd])) {
        if (nhex.district != hex.district) { adjColor.push(nhex.distColor); return }
      }
    })
    return HexMap.distColor.find(ci => !adjColor.includes(ci))
  }
  /** 
   * @param nh order of inner-hex: number hexes on side of meta-hex
   * @param mr make new district on meta-row
   * @param mc make new district on meta-col
   */
  makeDistrict(nh: number, district: number, mr: number, mc: number): Hex[] {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2 * nh - 1
    // irow-icol define topology of MetaHex composed of HexDistrict 
    let irow = (mr: number, mc: number) => {
      let ir = mr * dia - nh * (mcp + 1) + 1
      ir -= Math.floor((mc) / 2)              // - half a row for each metaCol
      return ir
    }
    let icol = (mr: number, mc: number, row: number) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh * 3 - 1) / 2))
      ic += (nh - 1)                        // from left edge to center
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col 
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    let row0 = irow(mr, mc), col0 = icol(mr, mc, row0), hex: Hex;
    let hexAry = Array<Hex>(); hexAry['Mr'] = mr; hexAry['Mc'] = mc;
    hexAry.push(hex = this.addHex(row0, col0, district)) // The *center* hex
    hex.metaLinks = {}; this.addMetaHex(hex, mr, mc)
    let rc: RC = { row: row0, col: col0 } // == {hex.row, hex.col}
    //console.groupCollapsed(`makelDistrict [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}:${district}-${dcolor}`)
    //console.log(`.makeDistrict: [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}`, hex)
    for (let ring = 1; ring < nh; ring++) {
      rc = this.nextRowCol(rc, 'W') // step West to start a ring
      // place 'ring' hexes along each axis-line:
      H.infDirs.forEach(dir => rc = this.newHexesOnLine(ring, rc, dir, district, hexAry))
    }
    //console.groupEnd()
    this.district[district] = hexAry
    if (hexAry[0] instanceof Hex2) {
      let hex2Ary = hexAry as Hex2[]
      let dcolor = district == 0 ? HexMap.distColor[0] : this.pickColor(hex2Ary)
      hex2Ary.forEach(hex => hex.setHexColor(dcolor))
    }
    return hexAry
  }
  /**
   * 
   * @param n number of Hex to create
   * @param hex start with a Hex to the West of this Hex
   * @param dir after first Hex move this Dir for each other hex
   * @param district 
   * @param hexAry push created Hex(s) on this array
   * @returns RC of next Hex to create (==? RC of original hex)
   */
  newHexesOnLine(n: number, rc: RC, dir: InfDir, district: number, hexAry: Hex[]): RC {
    let hex: Hex
    for (let i = 0; i < n; i++) {
      hexAry.push(hex = this.addHex(rc.row, rc.col, district))
      rc = this.nextRowCol(hex, dir)
    }
    return rc
  }

  copyLinksAndDistricts(gamePlay: GamePlay0) {
    let oldMap = gamePlay.hexMap
    oldMap.forEachHex((hex: Hex) => {
      this.addHex(hex.row, hex.col, hex.district)
      if (hex instanceof Hex2) hex.setHexColor(hex.distColor)
    })

  }
  /**
   * clear Stones & influence, add Stones, assertInfluence
   * @param gamePlay 
   */
   syncToGame(gamePlay: GamePlay0) {
    let oldMap = gamePlay.hexMap
    // doing hex.clearColor() en masse:
    this.allStones.splice(0, this.allStones.length) // clear allStones, so filter goes faster...
    this.forEachHex(hex => {
      hex.clearColor()                              // remove Stone & color
      hex.clearInf()                                // remove all influence
    })

    //oldMap.forEachHex(oldHex => {})
    oldMap.allStones.forEach(hsc => {
      let oldHex = hsc.hex, row = oldHex.row, col = oldHex.col
      let hex = this[row][col] || this.addHex(row, col, oldHex.district)
      hex.setColor(oldHex.stoneColor)
    })
  }

}
/** Marker class for HexMap used by GamePlayD */
export class HexMapD extends HexMap {

}

/** a HexMap that relies on a stack of underlying HexMap... */
export class HexMapLayer implements HexM {
  constructor(map0: HexMaps, hex: Hex, stoneColor: StoneColor) {
    this.base = (map0 instanceof HexMap) ? map0 : map0.base;
    this.parent = map0
    this.mh = this.base.mh
    this.nh = this.base.nh
    this.district = this.base.district
    this.mapCont = this.base.mapCont
    this.skipHex = this.base.skipHex
    this.resignHex = this.base.resignHex
    this.allStones = this.parent.allStones.concat([newHSC(hex, stoneColor)]) // new copy of allStones
  }
  base: HexMap
  parent: HexMaps

  readonly mh: number
  readonly nh: number
  readonly allStones: HSC[];
  readonly district: Hex[][];
  readonly mapCont: MapCont;
  readonly skipHex: Hex;
  readonly resignHex: Hex;

  makeAllDistricts(mh: number, nh: number) {return this.base.makeAllDistricts(mh, nh)}
  rcLinear(row: number, col: number): number { return this.base.rcLinear(row, col) }
  forEachHex<K extends Hex>(fn: (hex: K) => void): void { return this.base.forEachHex(fn) }
  update(): void { this.base.update() }
  showMark(hex: Hex): void { this.base.showMark() }

  addHex(row: number, col: number, district?: number) {
    return this.addHexHex(this.base[row][col], district)
  }
  addHexHex(hex: Hex, district = hex.district): Hex {
    let nhex = (hex instanceof Hex2)
      ? new Hex2(this, hex.row, hex.col)
      : new Hex(this, hex.row, hex.col)
    nhex.district = district
    return nhex
  }

}