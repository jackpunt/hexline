import { Container, DisplayObject, Graphics, Shape, Text } from "createjs-module";
import { C, F, Obj, RC, S, stime, Undo } from "@thegraid/createjs-lib";
import { HexAxis, HexDir, H, InfDir } from "./hex-intfs";
import { Stone, Table } from "./table";
import { otherColor, StoneColor, stoneColor0, stoneColorRecord, stoneColors, TP } from "./table-params";
import { GamePlay0 } from "./game-play";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip'

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

type LINKS = { [key in InfDir]?: Hex }
type INF   = { [key in InfDir]?: number }
type INFM   = { [key in HexAxis]?: InfMark }
type ToAxis = { [key in InfDir]: HexAxis }
type HSC = { hex: Hex, color: StoneColor, Aname?: string }

class InfMark extends Shape {
  static gE0: Graphics
  static gE1: Graphics
  static gInf(g: Graphics, color: string, w: number, wo: number, r: number) {
    if (C.dist(color, "black") < 10) w -= 1
    g.ss(w).s(color).mt(wo, r).lt(wo, -r); return g
  }
  static initStatic(again: boolean) {
    if (!again && !!InfMark.gE0) return
    InfMark.gE0 = new Graphics()
    InfMark.gE1 = new Graphics()
    let r = Stone.height - 1, w = 5, wo = w / 2
    let c0 = TP.colorScheme['black']
    let c1 = TP.colorScheme['white']
    if (C.dist(c1, "white") < 10) {
      InfMark.gInf(InfMark.gE1, 'lightgrey', w + 2, -wo, r)
    }
    InfMark.gInf(InfMark.gE1, c1, w, -wo, r)
    InfMark.gInf(InfMark.gE0, c0, w, wo, r)
  }
  /** @param ds show Influence on Axis */
  constructor(color: StoneColor, ds: HexAxis, x: number, y: number) {
    super((color === stoneColor0) ? InfMark.gE0 : InfMark.gE1)
    this.mouseEnabled = false
    this.rotation = H.dirRot[ds]
    this.x = x; this.y = y
    this[S.Aname] = `Inf[${color},${ds},${this.id}]`  // for debug, not production
  }
}
class CapMark extends Shape {
  static capSize = 4   // depends on HexMap.height
  constructor(hex: Hex2) {
    super()
    this.graphics.f(C.capColor).dp(0, 0, CapMark.capSize, 6, 0, 30)
    hex.cont.parent.localToLocal(hex.x, hex.y, hex.map.markCont, this)
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
  constructor(map: HexMap, row?: number, col?: number, name = `Hex@[${row},${col}]`) {
    this.Aname = name
    this.map = map
    this.row = row
    this.col = col
    this.links = {}
  }
  readonly Aname: string
  /** color of current Stone on this Hex (or undefined) */
  stoneColor: StoneColor = undefined;

  /** accessor so Hex2 can override-advise */
  _district: number // district ID
  get district() { return this._district }
  set district(d: number) {
    this._district = d
  }
  readonly map: HexMap;  // Note: this.parent == this.map.hexCont [cached]
  readonly row: number
  readonly col: number
  readonly inf = stoneColorRecord<INF>({},{})
  /** Link to neighbor in each H.dirs direction [NE, E, SE, SW, W, NW] */
  readonly links: LINKS = {}

  /** override to set CapMark */
  markCapture() {  }
  /** override to clear CapMark */
  unmarkCapture() {  }

  /** set hex.stoneColor and push HSC on allStones */
  setColor(color: StoneColor) {
    if (!color) return this.clearColor() // color that was cleared
    this.stoneColor = color
    let hsc = { Aname: this.Aname, hex: this, color }
    this.row !== undefined && this.map?.allStones.push(hsc) // no push: Aname == nextHex
    return color  // color that was set
  }
  clearColor() {
    let color = this.stoneColor
    if (!!color && !!this.map) {
      this.map.allStones = this.map.allStones.filter(hsc => hsc.hex !== this)
    }
    this.stoneColor = undefined
    return color
  }

  /**
   * Is this Hex [already] influenced by color/dn? [for skipAndSet()]
   * @param color StoneColor
   * @param dn dir of Influence: ds | revDir[ds]
   * @returns true if Hex is StoneColor or has InfMark(color, dn)
   */
  isInf(color: StoneColor, dn: InfDir) { return this.inf[color][dn] > 0}
  getInf(color: StoneColor, dn: InfDir) { return this.inf[color][dn] || 0 }
  // incInf(color: StoneColor, dn: InfDir) { return this.inf[color][dn] = (this.inf[color][dn] || 0) + 1 }
  // decInf(color: StoneColor, dn: InfDir) { return this.inf[color][dn] = (this.inf[color][dn] || 0) - 1 }
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
  //  v   
  // *1 *2 2 1
  //  0 *1 1 0
  // 
  //  v   
  // *1 *2 2 1 *1
  //  0 *1 1 0
  // 

  //     v
  // *1 *2 *3 3 2 1
  // *1  1 *1 1 0 0
  // pd(inc=1) -> inf=2; infn=1; nxt=0;
  // pd(inc=0) -> inf=*3, infn=1; nxt=1;
  // pd(inc=1) -> inf=3; infn=1; nxt=0;
  // pd(inc=0) -> inf=2; infn=0; nxt=0;
  // pd(inc=0) -> inf=1; infn=0; nxt=0;
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

  /** @return true if Hex is influenced on 2 or more Axies of color */
  isAttack(color: StoneColor): boolean {
    let attacks = new Set<HexAxis>(), infs = this.inf[color]
    Object.entries(infs).forEach(([dn, inf]) => {
      if (inf > 0) attacks.add(H.dnToAxis[dn])
    });
    return attacks.size >= 2 
  }
  /** @return true if Hex has a Stone (of other color), and is attacked */
  isCapture(color: StoneColor, hex?: Hex): boolean {
    return !!this.stoneColor && (this.stoneColor !== color) && this.isAttack(color)
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: InfDir): Hex {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds])) { hex = nhex }
    return hex    
  }  
}
/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex2 extends Hex {
  static borderColor = 'saddlebrown'

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
  override toString() {
    return `Hex[${this.row},${this.col}]`
  }

  /** Hex2 cell with graphics; shown as a polyStar Shape of radius @ (XY=0,0) */
  constructor(radius: number, map: HexMap, row?: number, col?: number, name?: string) {
    super(map, row, col, name);
    map.hexCont.addChild(this.cont)
    this.radius = radius
  
    this.setHexColor("grey")  // until setHexColor(by district)
    this.stoneIdText = new Text('', F.fontSpec(26))
    this.stoneIdText.textAlign = 'center'; this.stoneIdText.regY = -20

    if (row === undefined || col === undefined) return
    let w = radius * Math.sqrt(3), h = radius * 1.5
    this.x += col * w + Math.abs(row % 2) * w/2
    this.y += row * h
    this.cont.setBounds(-w/2, -h/2, w, h)

    let rc = `${row},${col}`, yc = -25
    this.hexShape.name = this.Aname

    let rct = this.rcText = new Text(rc, F.fontSpec(26)); // radius/2 ?
    rct.textAlign = 'center'; rct.y = yc // based on fontSize? & radius
    this.cont.addChild(rct)

    this.distText = new Text(``, F.fontSpec(20)); 
    this.distText.textAlign = 'center'; this.distText.y = yc + 46 // yc + 26+20
    this.cont.addChild(this.distText)
    this.showText(true)
  }
  /** set visibility of rcText & distText */
  showText(vis = !this.rcText.visible) {
    this.rcText.visible = this.distText.visible = vis
  }
  override setInf(color: StoneColor, dn: InfDir, inf: number): number {
    super.setInf(color, dn, inf)
    this.showInf(color, dn, (this.stoneColor !== color && (inf > 0 || this.isInf(color, H.dirRev[dn]))))
    return inf
  }
  showInf(color: StoneColor, dn: InfDir, show = true) {
    if (show) {
      let ds: HexAxis = H.dnToAxis[dn]     // infm only on [ds]
      if (this.stoneColor !== color && !this.infm[color][ds]) {
        this.infm[color][ds] = new InfMark(color, ds, this.x, this.y)
      }
      this.map.infCont.addChild(this.infm[color][ds])
    } else {
      let infMark = this.infm[color][H.dnToAxis[dn]]
      infMark?.parent?.removeChild(infMark)
    }
  }
  override clearInf(): void {
    stoneColors.forEach(color => {
      for (let mark of Object.values(this.infm[color])) 
        mark?.parent?.removeChild(mark)
    })
    super.clearInf()
  }

  /** make and show a CapMark on this Hex2 */
  override markCapture() {
    super.markCapture()
    if (this.capMark === undefined) { this.capMark = this.map.markCont.addChild(new CapMark(this)) }
    this.capMark.visible = true
  }
  override unmarkCapture() {
    super.unmarkCapture()
    this.capMark && (this.capMark.visible = false) 
  }

  setStoneId(id: number | string) {
    let sid = typeof id === 'number' ? `${id}` : id
    this.stoneIdText.text = this.stoneIdText ? sid : ''
    this.stoneIdText.color = otherColor(this.stone.color)
    let cont: Container = this.map.stoneCont
    this.cont.parent.localToLocal(this.x, this.y, cont, this.stoneIdText)
    cont.addChild(this.stoneIdText)
  }
  clearStoneId() {
    this.stoneIdText?.parent?.removeChild(this.stoneIdText)
  }
  /** make a Stone on this Hex2 (from addStone(color)) */
  override setColor(stoneColor: StoneColor): StoneColor {
    super.setColor(stoneColor)
    if (stoneColor) {
      let stone = this.stone = new Stone(stoneColor)
      stone[S.Aname] = `[${this.row},${this.col}]`
      let cont: Container = this.map.stoneCont
      this.cont.parent.localToLocal(this.x, this.y, cont, stone)
      cont.addChild(stone)
    } // else this.clearColor() has been called
    return stoneColor
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
    ns.graphics.s(Hex2.borderColor).dp(0, 0, rad+1, 6, 0, tilt) // s = beginStroke(color) dp:drawPolyStar
    ns.graphics.f(color).dp(0, 0, rad, 6, 0, tilt)             // f = beginFill(color)
    //ns.rotation = H.dirRot[H.N]
  return ns
  }
  override lastHex(ds: InfDir): Hex {
    return super.lastHex(ds) as Hex
  }
}

/** 
 * HexMap[row][col]: Hex or Hex2 elements. 
 * If mapCont is set, then populate with Hex2 
 * 
 * (TP.mh X TP.nh) hexes in districts; allStones: HSC[]
 * 
 * With a Mark and off-map: skipHex & resignHex
 * 
 */
export class HexMap extends Array<Array<Hex>> {
  radius: number = TP.hexRad
  height: number = this.radius * 1.5;
  width: number = this.radius * Math.sqrt(3);
  mapCont: Container     // if using Hex2
  hexCont: Container     // hex shapes on bottom
  stoneCont: Container   // Stone in middle
  markCont: Container    // showMark over Stones
  infCont: Container     // infMark on the top
  mark: DisplayObject
  minRow: number = undefined               // Array.forEach does not look at negative indices!
  minCol: number = undefined
  maxCol: number = undefined
  get nCol() { return 1 + this.maxCol - this.minCol }
  /** Each occupied Hex, with the occupying StoneColor  */
  allStones: HSC[] = []                    // aka hexStones in Board
  skipHex: Hex;
  resignHex: Hex;
  distSize: number;      // nh: number of hex sides for each district (1--6)
  metaSize: number;      // mh: MetaHex order (2 or 3)
  nDistricts: number;    // number of districts = ftHexes(metaSize)
  district: Array<Hex[]> = []
  // A color for each District:
  distColor = ["lightgrey","limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

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

  /** HexMap: TP.mh X TP.nh hexes in districts; with a Mark, an off-map: skipHex & resignHex */
  constructor(radius: number = TP.hexRad, mapCont?: Container) {
    super()
    this.radius = radius
    this.height = radius * Math.sqrt(3)
    this.width = radius * 1.5
    CapMark.capSize = this.width/2
    this.mark = this.makeMark(radius, radius/2.5)
    this.skipHex = new Hex(this, undefined, undefined, S_Skip)
    this.resignHex = new Hex(this, undefined, undefined, S_Resign)
    if (!!mapCont) this.addToCont(mapCont, undefined)
  }
  addToCont(mapCont: Container, table?: Table): this {
    this.mapCont = mapCont
    this.hexCont = new Container()     // hex shapes on bottom
    this.stoneCont = new Container()   // Stone in middle
    this.markCont = new Container()    // showMark under Stones
    this.infCont = new Container()     // infMark on the top
    // hexCont, stoneCont, markCont all x,y aligned
    mapCont.addChild(this.hexCont); this.hexCont[S.Aname] = "hexCont"
    mapCont.addChild(this.stoneCont); this.stoneCont[S.Aname] = "stoneCont"
    mapCont.addChild(this.markCont); this.markCont[S.Aname] = "markCont"
    mapCont.addChild(this.infCont); this.infCont[S.Aname] = "infCont"
    return this
  }

  initInfluence(again = false): this { 
    InfMark.initStatic(again)
    return this 
  }
  centerOnContainer() {
    let hexRect = this.hexCont.getBounds()
    this.hexCont.x = this.markCont.x = this.stoneCont.x = this.infCont.x = -(hexRect.x + hexRect.width/2)
    this.hexCont.y = this.markCont.y = this.stoneCont.y = this.infCont.y = -(hexRect.y + hexRect.height/2)
  }

  update() { this.hexCont.parent?.stage.update()}
  addHex(row: number, col: number, district: number ): Hex {
    // If we have an on-screen Container, then use Hex2: (addToCont *before* makeAllDistricts)
    let hex = !!this.hexCont ? new Hex2(this.radius, this, row, col) : new Hex(this, row, col)
    hex.district = district // and set Hex2.districtText
    if (!this[row]) {
      this[row] = new Array<Hex>()
      if (this.minRow === undefined || row < this.minRow) this.minRow = row
    }
    if (this.minCol === undefined || col < this.minCol) this.minCol = col
    if (this.maxCol === undefined || col > this.maxCol) this.maxCol = col
    this[row][col] = hex   // addHex to this Array<Array<Hex>>
    this.link(hex)   // link to existing neighbors
    return hex
  }
  /** Array.forEach does not use negative indices: ASSERT [row,col] is non-negative */
  forEachHex<K extends Hex>(fn: (hex: K) => void) {
    // minRow generally [0 or 1] always <= 5, so not worth it
    //for (let ir = this.minRow || 0; ir < this.length; ir++) { 
    for (let ir of this) {
      // beginning and end of this AND ir may be undefined
      for (let hex of ir) { hex !== undefined && fn(hex as K) }
    }
  }
  findHex<K extends Hex>(fn: (hex: K) => boolean): K {
    let found: K
    for (let ir of this) {
      if (!ir) continue
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
  showMark(hex?: Hex) {
    if (!hex || hex.Aname === S_Skip || hex.Aname === S_Resign) {
      this.mark.visible = false
    } else if (hex instanceof Hex2) {
      this.mark.x = hex.x
      this.mark.y = hex.y
      this.markCont.addChild(this.mark) // show mark *below* Stone & infMark
      this.mark.visible = true
    }
    this.update()
  }
  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  ewEvenRow = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }}
  ewOddRow = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: {dc: 0, dr: 1}, W: {dc: -1, dr: 0}, NW: {dc: 0, dr: -1}}
  nsOddCol = {
    NE: { dc: 1, dr: -1 }, SE: { dc: 1, dr: 0 }, S: { dc: 0, dr: 1 }, N: { dc: 0, dr: -1 },
    SW: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }}
  nsEvenCol = {
    NE: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 }, S: { dc: 0, dr: 1 }, N: { dc: 0, dr: -1 },
    SW: { dc: -1, dr: 1}, NW: { dc: -1, dr: 0 }}
  nsTopo(rc: RC): {} { return (rc.col % 2 == 0) ? this.nsEvenCol : this.nsOddCol }

  nextRowCol(hex: RC, dir: HexDir, nt: {} = (hex.row % 2 == 0) ? this.ewEvenRow : this.ewOddRow): RC {
    let row = hex.row + nt[dir].dr, col = hex.col + nt[dir].dc 
    return {row, col}
  }
  link(hex: Hex) {
    let nt = (hex.row % 2 == 0) ? this.ewEvenRow : this.ewOddRow
    H.dirs.forEach(dir => {
      let row = hex.row + nt[dir].dr, col = hex.col + nt[dir].dc //let {row, col} = this.nextRowCol(hex, dir, nt)
      let nHex = this[row] && this[row][col]
      if (!!nHex) {
        hex.links[dir] = nHex
        nHex.links[H.dirRev[dir]] = hex
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
    let obj = this.hexCont.getObjectUnderPoint(x, y, 1) // 0=all, 1=mouse-enabled (Hex, not Stone)
    return (obj instanceof HexCont) && obj.hex
  }
  /**
   * 
   * @param mh order of meta-hexes (2 or 3 for this game) [TP.mHexes]
   * @param nh size of meta-hex (1..6) [TP.nHexes]
   */
  makeAllDistricts(mh: number, nh: number) {
    this.metaSize = mh
    this.distSize = nh
    this.nDistricts = TP.ftHexes(mh) // 7 or 19

    let hexMap = this, district = 0
    let mrc: RC = { col: Math.ceil((mh+1) / 2), row: Math.floor(mh*1.25) } // row,col to be non-negative
    let dirs: HexDir[] = ['NE', 'SE', 'S', 'SW', 'NW', 'N',] // N-S aligned!
    let hexAry = this.makeDistrict(nh, district++, mrc.row, mrc.col) // Central District [0]
    for (let ring = 1; ring < mh; ring++) {
      //mrc.row -= 1 // start to North
      mrc = hexMap.nextRowCol(mrc, 'NW', hexMap.nsTopo(mrc)) // NW + NE => 'N' for next metaHex
      dirs.forEach(dir => {
        // newMetaHexesOnLine(ring, rc, dir, district, dcolor, hexAry)
        for (let i = 0; i < ring; i++) {
          mrc = hexMap.nextRowCol(mrc, dir, hexMap.nsTopo(mrc))
          hexAry = this.makeDistrict(nh, district++, mrc.row, mrc.col)
        }
      })
    }
    this.centerOnContainer()
  }
  pickColor(hexAry: Hex2[]): string {
    let hex = hexAry[0]
    let adjColor: string[] = [hex.map.distColor[0]] // colors not to use
    H.dirs.forEach(hd => {
      let nhex: Hex2 = hex
      while (!!(nhex = nhex.links[hd])) {
        if (nhex.district != hex.district) { adjColor.push(nhex.distColor); return }
      }
    })
    return hex.map.distColor.find(ci => !adjColor.includes(ci))
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
      let dcolor = district == 0 ? this.distColor[0] : this.pickColor(hex2Ary)
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
// class HexMap2 extends HexMap {
//   constructor(radius: number = TP.hexRad, mapCont?: Container) {
//     super(radius, mapCont)
//   }
// }