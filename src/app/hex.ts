import { Container, Graphics, Shape } from "createjs-module";
import { C, Dir, HexDir, S, XY } from "./basic-intfs";
import { Stone } from "./table";
import { TP, StoneColor } from "./table-params";

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon
class InfMark extends Shape {
  static gEw: Graphics
  static gEb: Graphics
  static initStatic() {
    if (!!InfMark.gEw) return
    let r = Stone.height - 1
    InfMark.gEw = new Graphics().ss(2).s(C.white).mt(2, r).lt(2, -r)
    InfMark.gEb = new Graphics().ss(2).s(C.black).mt(-2, r).lt(-2, -r)
  }

  temp: HexDir;
  constructor(dn: HexDir, color: StoneColor, temp?: HexDir) {
    let g: Graphics = (color === C.white) ? InfMark.gEw : InfMark.gEb
    super(g)
    this.rotation = S.dirRot[dn]
    this.temp = temp
  }
}
type NES = {NE?: InfMark, E?: InfMark, SE?: InfMark }
type INF = {black: NES, white: NES} // keyof INF === StoneColor
type InfDir = keyof NES        // 'NE' | 'E' | 'SE'

class CapMark extends Shape {
  static capSize = 4   // depends on HexMap.height
  constructor() {
    super()
    this.graphics.beginFill(C.capColor).drawPolyStar(0, 0, CapMark.capSize, 6, 0, 30)

  }

}
/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex extends Container {
  Aname: string
  hexShape: Shape // not currently used
  district: number
  color: string  // district color of Hex
  row: number
  col: number
  map: HexMap;  // Note: this.parent == this.map.cont
  stone: Stone
  captured: CapMark; // set if recently captured (markCapture)
  /** color of the Stone or undefined */
  get stoneColor(): StoneColor { return !!this.stone ? this.stone.color : undefined};
  inf: INF

  /** Link to neighbor in each S.dirs direction [NE, E, SE, SW, W, NW] */
  NE: Hex; E: Hex; SE: Hex; SW: Hex; W: Hex; NW: Hex
  /**
   * 
   * @param ds one of S.Dir3 (major axis)
   * @param color StoneColor
   * @param dn dir of Influence: ds | revDir[ds]
   * @returns true if Hex is StoneColor or full InfMark or InfMark.temp == dn
   */
  isInf(ds: HexDir, color: StoneColor, dn?: HexDir): boolean {
    if (this.stoneColor == color) return true
    let inf = this.getInf(ds, color)
    return !!inf && (!inf.temp || inf.temp == dn)
  }
  /**
   * set temp = dn OR set temp = undefined if (temp != dn)
   * @param ds one of S.Dir3 (major axis)
   * @param color 
   * @param dt one of S.Dir (direction of scan for temp)
   * @returns true if this Hex is now influenced by color (on axis: ds)
   */
  setInf(ds: HexDir, color: StoneColor, dt?: HexDir): boolean {
    let infMark = this.getInf(ds, color)
    if (!!infMark && !infMark.temp) return true // already set
    if (!!infMark && infMark.temp != dt) {
      infMark.temp = undefined // was rev(dn): now adding (dn), so is full InfMark(ds, color)
    } else {
      // put tmpMark(ds, color, dn) in Hex, but not on HexMap display
      infMark = new InfMark(ds, color, dt)
      this.inf[color][ds] = infMark
      // place InfMark on HexMap:
      let pt = this.parent.localToLocal(this.x, this.y, this.map.markCont)
      infMark.x = pt.x; infMark.y = pt.y
      this.map.markCont.addChild(infMark)
    }
    return true
  }
  getInf(dn: string, color: StoneColor): InfMark {
    return this.inf[color][dn]
  }
  delInf(dn: string, color: StoneColor) {
    delete this.inf[color][dn]
  }
  setNoInf() {
    this.inf = {black: {}, white: {}}
  }
  /** @return true if Hex is doubly influenced by color */
  isAttack(color: StoneColor): boolean {
    let attacks = Object.entries(this.inf[color]).filter((kv: [InfDir, InfMark]) => kv[0] !== undefined)
    return attacks.length >= 2 
  }
  /** @return true if Hex has a Stone (of other color), and is attacked */
  isCapture(color: StoneColor): boolean {
    return !!this.stoneColor && (this.stoneColor !== color) && this.isAttack(color)
  }

  markCapture() {
    if (!!this.captured) return // only 1 CapMark per Hex
    this.addChild(this.captured = new CapMark())
  }
  unmarkCapture() {
    this.captured && this.removeChild(this.captured)
    this.captured = undefined
  }

  /** makes a colored hex, outlined with bgColor */
  hex(rad: number, color: string): Shape {
    let ns = new Shape(), tilt = 30
    ns.graphics.beginStroke(TP.bgColor).drawPolyStar(0, 0, rad+1, 6, 0, tilt)
    ns.graphics.beginFill(color).drawPolyStar(0, 0, rad, 6, 0, tilt)
    return ns
  }

  constructor(color: string, radius: number, row?: number, col?: number, xy?: XY) {
    super();
    this.setNoInf()
    let dir = Dir.E
    this.color = color
    let hexShape = this.hex(radius, color)
    hexShape.rotation = S.dirRot[dir]
    hexShape.name = this.Aname
    this.hitArea = hexShape
    this.addChild(hexShape)
    this.hexShape = hexShape
    if (!!xy) { this.x = xy.x; this.y = xy.y }

    if (row === undefined || col === undefined) return
    this.Aname = `Hex@[${row},${col}]`
    this.row = row
    this.col = col
    let h = radius * Math.sqrt(3)/2
    this.x = col * 2 * h + Math.abs(row % 2) * h
    this.y = row * 1.5 * radius
  }
}
/** HexMap[row][col] keep registry of all Hex items map to/from [row, col] */
export class HexMap extends Array<Array<Hex>> {
  radius: number = 50
  height: number;
  hexCont: Container = new Container()     // hex shapes on bottom
  stoneCont: Container = new Container()   // Stone in middle
  markCont: Container = new Container()    // infMark on the top
  mark: Shape
  constructor(radius: number = 50, mapCont?: Container) {
    super()
    this.radius = radius
    this.height = radius * Math.sqrt(3)/2
    CapMark.capSize = this.height
    if (!!mapCont) {                 // hexCont, stoneCont, markCont all x,y aligned
      mapCont.addChild(this.hexCont)
      mapCont.addChild(this.stoneCont)
      mapCont.addChild(this.markCont)
    }
    this.mark = new Shape();
    this.mark.graphics.beginFill(C.markColor).drawPolyStar(0, 0, radius, 6, 0, 30)
    InfMark.initStatic()
  }
  update() { !!this.hexCont.parent && this.hexCont.stage.update()}
  // A color for each District:
  distColor = ["lightgrey","rgb(255,104,135)","rgb(255,194,61)","rgb(255,255,128)","lightgreen","rgb(160,190,255)","rgb(218,145,255)"]
  addHex(row: number, col: number, district: number ): Hex {
    let color = this.distColor[district]
    let hex = new Hex(color, this.radius, row, col)
    hex.district = district
    if (!this[row]) this[row] = new Array<Hex>()
    this[row][col] = hex
    hex.map = this
    if (!!this.hexCont) this.hexCont.addChild(hex)
    this.link(hex)   // link to existing neighbors
    return hex
  }
  forEachHex(fn: (hex: Hex) => void) {
    this.forEach((hexRow: Hex[]) => {
      hexRow.forEach((hex: Hex) => fn(hex))
    })
  }
  mapEachHex<T>(fn: (hex: Hex) => T): T[] {
    let rv: T[] = []
    this.forEach((hexRow: Hex[]) => {
      hexRow.forEach((hex: Hex) => rv.push(fn(hex)))
    })
    return rv
  }
  filterEachHex(fn: (hex: Hex) => boolean): Hex[] {
    let rv: Hex[] = []
    this.forEach((hexRow: Hex[]) => {
      hexRow.forEach((hex: Hex) => fn(hex) && rv.push(hex))
    })
    return rv
  }
  showMark(hex?: Hex) {
    if (!hex) {
      this.mark.visible = false
    } else {
      this.mark.x = hex.x
      this.mark.y = hex.y
      this.hexCont.addChild(this.mark) // show mark *below* Stone
      this.mark.visible = true
      this.update()
    }
  }
  /** neighborhood topology */
  n0 = {NE: {dc: 0, dr: -1}, E: {dc: 1, dr: 0}, SE: {dc: 0, dr: 1}, 
        SW: {dc: -1, dr: 1}, W: {dc: -1, dr: 0}, NW: {dc: -1, dr: -1}}
  n1 = {NE: {dc: 1, dr: -1}, E: {dc: 1, dr: 0}, SE: {dc: 1, dr: 1}, 
        SW: {dc: 0, dr: 1}, W: {dc: -1, dr: 0}, NW: {dc: 0, dr: -1}}

  link(hex: Hex) {
    let n = (hex.row % 2 == 0) ? this.n0 : this.n1
    S.dirs.forEach(dir => {
      let nr = hex.row + n[dir].dr , nc = hex.col + n[dir].dc 
      let nHex = this[nr] && this[nr][nc]
      if (!!nHex) {
        hex[dir] = nHex
        nHex[S.dirRev[dir]] = hex
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