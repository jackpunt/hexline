import { Container, Shape } from "createjs-module";
import { C, Dir, S } from "./basic-intfs";

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex extends Container {
  Aname: string
  shape: Shape
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

  constructor(color: string, radius: number, row: number = 0, col: number = 0) {
    super();
    this.Aname = `Hex@[${row},${col}]`
    this.row = row
    this.col = col
    let dir = Dir.E
    this.color = color
    this.shape = this.hex(radius, color)
    this.shape.rotation = S.dirRot[dir]
    this.shape.name = Dir[dir]
    let h = radius * Math.sqrt(3)/2
    this.shape.x = col * 2 * h + (row % 2) * h
    this.shape.y = row * 1.5 * radius
    this.addChild(this.shape)
  }
}
/** HexMap[row][col] keep registry of all Hex items map to/from [row, col] */
export class HexMap extends Array<Array<Hex>> {
  radius: number = 50
  height: number;
  cont: Container
  constructor(radius: number = 50, cont?: Container) {
    super()
    this.radius = radius
    this.height = radius * Math.sqrt(3)/2
    this.cont = cont
  }
  addHex(row: number, col: number, color: string = "lightPink" ): Hex {
    let hex = new Hex(color, this.radius, row, col)
    if (!this[row]) this[row] = new Array<Hex>()
    this[row][col] = hex
    hex.map = this
    if (!!this.cont) this.cont.addChild(hex)
    this.link(hex)   // link to existing neighbors
    return hex
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
}