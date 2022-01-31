import { Container, Shape } from "createjs-module";
import { C, Dir, S, XY } from "./basic-intfs";

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex extends Container {
  Aname: string
  shape: Shape
  district: number
  color: string
  row: number
  col: number
  map: HexMap;
  /** Link to neighbor in each S.dirs direction [NE, E, SE, SW, W, NW] */
  NE: Hex; E: Hex; SE: Hex; SW: Hex; W: Hex; NW: Hex

  /** makes a colored hex, outlined with BLACK */
  hex(rad: number, color: string): Shape {
    let ns = new Shape()
    ns.graphics.beginStroke(C.BLACK).drawPolyStar(0, 0, rad+1, 6, 0, -90)
    ns.graphics.beginFill(color).drawPolyStar(0, 0, rad, 6, 0, -90)
    return ns
  }

  constructor(color: string, radius: number, row?: number, col?: number, xy?: XY) {
    super();
    let dir = Dir.E
    this.color = color
    this.shape = this.hex(radius, color)
    this.shape.rotation = S.dirRot[dir]
    this.shape.name = this.Aname
    this.addChild(this.shape)
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
  cont: Container
  mark: Shape
  constructor(radius: number = 50, cont?: Container) {
    super()
    this.radius = radius
    this.height = radius * Math.sqrt(3)/2
    this.cont = cont
    this.mark = new Shape()
    this.mark.graphics.beginFill("rgba(200,200,200,35)").drawPolyStar(0, 0, radius, 6, 0, -90)
  }
  distColor = ["lightgrey","rgb(255,104,135)","rgb(255,194,61)","rgb(255,255,128)","lightgreen","rgb(160,190,255)","rgb(218,145,255)"]
  addHex(row: number, col: number, district: number ): Hex {
    let color = this.distColor[district]
    let hex = new Hex(color, this.radius, row, col)
    hex.district = district
    if (!this[row]) this[row] = new Array<Hex>()
    this[row][col] = hex
    hex.map = this
    if (!!this.cont) this.cont.addChild(hex)
    this.link(hex)   // link to existing neighbors
    return hex
  }
  showMark(hex?: Hex) {
    if (!hex) {
      this.mark.visible = false
    } else {
      this.mark.x = hex.x
      this.mark.y = hex.y
      this.cont.addChild(this.mark)
      this.mark.visible = true
      this.cont.stage.update()
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
    let obj = this.cont.getObjectUnderPoint(x, y, 1) // 0=all, 1=mouse-enabled (Hex, not Stone)
    if (obj instanceof Hex) return obj // not happening (unless we set a hitArea!)
    if (obj instanceof Shape && obj.parent instanceof Hex) return obj.parent
    return null
  }
}