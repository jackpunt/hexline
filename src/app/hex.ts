import { Container, Graphics, Shape, Text } from "createjs-module";
import { C, Dir, F, HexDir, RC, S, XY, HexAxis } from "./basic-intfs";
import { Stone } from "./table";
import { TP, StoneColor, stoneColor0, stoneColor1, stoneColors } from "./table-params";

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

export type InfDir = Exclude<HexDir, 'N' | 'S'>        // 
type LINKS = {[key in InfDir] : Hex}
type INF   = {[key in InfDir] : Hex}[] // index of INF == StoneColor
type ToAxis= {[key in InfDir] : HexAxis}
const dnToAxis: ToAxis = { NW: 'SE', W: 'E', SW: 'NE', NE: 'NE', E: 'E', SE: 'SE' }

class InfMark extends Shape {
  static gE0: Graphics
  static gE1: Graphics
  static gInf(g: Graphics, color: string, w: number, wo: number, r: number) {
    if (C.dist(color, "black")) w -= 1
    g.ss(w).s(color).mt(wo, r).lt(wo, -r); return g
  }
  static initStatic(hexMap: HexMap) {
    if (!!InfMark.gE0) return
    InfMark.gE0 = new Graphics()
    InfMark.gE1 = new Graphics()
    let r = Stone.height - 1, w = 5, wo = w / 2
    if (C.dist(stoneColor1, "white") < 10) {
      InfMark.gInf(InfMark.gE1, 'lightgrey', w + 2, -wo, r)
      hexMap.distColor[3] = C.dimYellow
    }
    InfMark.gInf(InfMark.gE1, stoneColor1, w, -wo, r)
    InfMark.gInf(InfMark.gE0, stoneColor0, w, wo, r)
  }
  /** @param ds assert Influence in direction */
  constructor(ds: HexAxis, color: StoneColor) {
    let g: Graphics = (color === stoneColor0) ? InfMark.gE0 : InfMark.gE1
    super(g)
    this.rotation = S.dirRot[ds]
  }
}
class CapMark extends Shape {
  static capSize = 4   // depends on HexMap.height
  constructor(hex: Hex) {
    super()
    this.graphics.beginFill(C.capColor).drawPolyStar(0, 0, CapMark.capSize, 6, 0, 30)
    hex.parent.localToLocal(hex.x, hex.y, hex.map.markCont, this)
  }

}
/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex extends Container {
  static borderColor = 'saddlebrown'

  Aname: string
  hexShape: Shape // not currently used
  _district: number // district ID
  get district() {return this._district}
  set district(d: number) {
    this._district = d
    let dt = new Text(`${d}`, F.fontSpec(20)); dt.x = -this.width/2+15; dt.y = 20
    if (!!this.distText) this.removeChild(this.distText)
    this.distText = this.addChild(dt)
  }
  distText: Text
  color: string  // district color of Hex
  row: number
  col: number
  map: HexMap;  // Note: this.parent == this.map.hexCont [cached]
  stone: Stone
  captured: CapMark; // set if recently captured (markCapture)
  /** color of the Stone or undefined */
  get stoneColor(): StoneColor { return !!this.stone ? this.stone.color : undefined};
  inf: INF
  width: number;
  height: number;

  /** Link to neighbor in each S.dirs direction [NE, E, SE, SW, W, NW] */
  links: LINKS = {
    NE: undefined,
    E: undefined,
    SE: undefined,
    SW: undefined,
    W: undefined,
    NW: undefined
  }
  /** set hexShape using color */
  setHexColor(color: string, district?: number) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    let hexShape = this.hex(this.height, color)
    if (!!this.hexShape) this.removeChild(this.hexShape)
    this.addChildAt(hexShape, 0)
    this.hitArea = hexShape
    this.color = color
    this.hexShape = hexShape
  }

  /** One Hex cell in the game, shown as a polyStar Shape of radius @ (XY=0,0) */
  constructor(color: string, radius: number, row?: number, col?: number, xy?: XY) {
    super();
    let h = radius * Math.sqrt(3)/2
    this.width = h
    this.height = radius

    this.setNoInf(false) // assert: no infMarks to del/removeChild
    this.setHexColor(color)
    if (!!xy) { this.x = xy.x; this.y = xy.y }

    if (row === undefined || col === undefined) return
    this.Aname = this.hexShape.name = `Hex@[${row},${col}]`
    let rc = `${row},${col}`, rct = new Text(rc, F.fontSpec(26)); rct.x = -radius/2; rct.y = -15
    this.addChild(rct)
    this.x += col * 2 * h + Math.abs(row % 2) * h
    this.y += row * 1.5 * radius
    this.row = row
    this.col = col
  }
  /**
   * for skipAndSet()
   * @param dn dir of Influence: ds | revDir[ds]
   * @param color StoneColor
   * @returns true if Hex is StoneColor or full InfMark(ds) or InfMark.temp(dn)
   */
  isInf(dn: InfDir, color: StoneColor): boolean {
    if (this.stoneColor == color) return true
    return !!this.getInf(dn, color)
  }
  getInf(dn: InfDir, color: StoneColor): InfMark {
    return this.inf[color][dn]
  }  /**
   * set temp = dn OR set temp = undefined if (temp != dn)
   * @param ds one of S.Dir3 (major axis)
   * @param color 
   * @returns true if this Hex is now influenced by color (on axis: ds)
   */
  setInf(dn: InfDir, color: StoneColor, ds: HexAxis) {
    if (!this.getInf(dn, color)) {
      let infMark = new InfMark(ds, color)
      this.inf[color][dn] = infMark
      if (!this.getInf(S.dirRev[dn], color)) {
        // place first (of dt|rev[dt]) InfMark on HexMap:
        let pt = this.parent.localToLocal(this.x, this.y, this.map.infCont)
        infMark.x = pt.x; infMark.y = pt.y
        this.map.infCont.addChild(infMark)
      }
    }
  }

  /**
   * @param dn generally the primary axis
   * @param color 
   * @param rev if true also remove reverse dir
   */
  delInf(dn: InfDir, color: StoneColor, rev = true) {
    if (rev) this.delInf(S.dirRev[dn], color, false)
    let infMark = this.getInf(dn, color)
    if (!!infMark) {
      infMark.parent && infMark.parent.removeChild(infMark)
      delete this.inf[color][dn]
    }
  }
  /** create empty inf for each color & InfDir */
  setNoInf(rmChild = true) {
    if (rmChild) stoneColors.forEach(color => {
      this.inf[color].forEach((inf: InfMark) => inf.parent.removeChild(inf))
    })
    this.inf = []; this.inf[stoneColor0] = {}; this.inf[stoneColor1] = {};
  }
  
  /** @return true if Hex is doubly influenced by color */
  isAttack(color: StoneColor): boolean {
    let attacks = new Set<HexAxis>(), infs = this.inf[color] as InfMark[]
    Object.entries(infs).forEach(([dn, inf]) => {
      let axis: HexAxis = dnToAxis[dn]
      attacks.add(axis)
    });
    return attacks.size >= 2 
  }
  /** @return true if Hex has a Stone (of other color), and is attacked */
  isCapture(color: StoneColor): boolean {
    return !!this.stoneColor && (this.stoneColor !== color) && this.isAttack(color)
  }

  markCapture() {
    if (!!this.captured) return // only 1 CapMark per Hex
    this.map.markCont.addChild(this.captured = new CapMark(this))
  }
  unmarkCapture() {
    this.captured && this.map.markCont.removeChild(this.captured)
    this.captured = undefined
  }

  /** makes a colored hex, outlined with bgColor */
  hex(rad: number, color: string): Shape {
    let ns = new Shape(), tilt = 30
    ns.graphics.s(Hex.borderColor).dp(0, 0, rad+1, 6, 0, tilt) // s = beginStroke(color) dp:drawPolyStar
    ns.graphics.f(color).dp(0, 0, rad, 6, 0, tilt)             // f = beginFill(color)
    ns.rotation = S.dirRot[Dir.E]
  return ns
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: InfDir) {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds])) { hex = nhex }
    return hex    
  }
}
/** HexMap[row][col] keep registry of all Hex items map to/from [row, col] */
export class HexMap extends Array<Array<Hex>> {
  radius: number = 50
  height: number;
  hexCont: Container = new Container()     // hex shapes on bottom
  markCont: Container = new Container()    // showMark under Stones
  stoneCont: Container = new Container()   // Stone in middle
  infCont: Container = new Container()     // infMark on the top
  mark: Shape
  minRow: number = undefined               // Array.forEach does not look at negative indices!
  // A color for each District:
  distColor = ["lightgrey","limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

  constructor(radius: number = 50, mapCont?: Container) {
    super()
    this.radius = radius
    this.height = radius * Math.sqrt(3)/2
    CapMark.capSize = this.height
    if (!!mapCont) {                 // hexCont, stoneCont, markCont all x,y aligned
      mapCont.addChild(this.hexCont)  ; this.hexCont[S.aname]   = "hexCont"
      mapCont.addChild(this.markCont) ; this.hexCont[S.aname]   = "markCont"
      mapCont.addChild(this.stoneCont); this.stoneCont[S.aname] = "stoneCont"
      mapCont.addChild(this.infCont) ; this.infCont[S.aname]    = "infCont"
    }
    this.mark = new Shape();
    this.mark.graphics.beginFill(C.markColor).drawPolyStar(0, 0, radius, 6, 0, 30)
    InfMark.initStatic(this)
  }
  update() { !!this.hexCont.parent && this.hexCont.stage.update()}
  addHex(row: number, col: number, district: number, dc: number, xy?: XY ): Hex {
    let color = this.distColor[dc]
    let hex = new Hex(color, this.radius, row, col, xy)
    hex.district = district
    if (!this[row]) {
      this[row] = new Array<Hex>()
      if (row < (this.minRow || 1)) this.minRow = row
    }
    this[row][col] = hex
    hex.map = this
    if (!!this.hexCont) this.hexCont.addChild(hex)
    this.link(hex)   // link to existing neighbors
    return hex
  }
  forEachHex(fn: (hex: Hex) => void) {
    for (let ir = this.minRow || 0; ir < this.length; ir++) {
      !!this[ir] && this[ir].forEach((hex: Hex) => fn(hex))
    }
  }
  mapEachHex<T>(fn: (hex: Hex) => T): T[] {
    let rv: T[] = []
    this.forEachHex((hex: Hex) => rv.push(fn(hex)))
    return rv
  }
  filterEachHex(fn: (hex: Hex) => boolean): Hex[] {
    let rv: Hex[] = []
    this.forEachHex((hex: Hex) => fn(hex) && rv.push(hex))
    return rv
  }
  showMark(hex?: Hex) {
    if (!hex) {
      this.mark.visible = false
    } else {
      this.mark.x = hex.x
      this.mark.y = hex.y
      this.markCont.addChild(this.mark) // show mark *below* Stone & infMark
      this.mark.visible = true
      this.update()
    }
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
    S.dirs.forEach(dir => {
      let row = hex.row + nt[dir].dr, col = hex.col + nt[dir].dc //let {row, col} = this.nextRowCol(hex, dir, nt)
      let nHex = this[row] && this[row][col]
      if (!!nHex) {
        hex.links[dir] = nHex
        nHex.links[S.dirRev[dir]] = hex
      }
    });
  }

  /**
   * The Hex under the given x,y coordinates.
   * If on the line, then the top (last drawn) Hex.
   * @param x in local coordinates of this HexMap.cont
   * @param y 
   * @returns the Hex under mouse or null, if not a Hex (background)
   */
  hexUnderPoint(x: number, y: number): Hex {
    let obj = this.hexCont.getObjectUnderPoint(x, y, 1) // 0=all, 1=mouse-enabled (Hex, not Stone)
    if (obj instanceof Hex) return obj // Hex.hitArea = hexShape
    return null
  }
}