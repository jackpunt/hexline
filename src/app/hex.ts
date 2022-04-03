import { Container, Graphics, Shape, Text } from "createjs-module";
import { C, F, RC, S, Undo } from "@thegraid/createjs-lib";
import { HexAxis, HexDir, H, InfDir } from "./hex-intfs";
import { Stone } from "./table";
import { StoneColor, stoneColor0, stoneColor1, stoneColors, TP } from "./table-params";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip'

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

type LINKS = { [key in InfDir]: Hex }
type INF   = { [key in HexAxis]?: { [key in InfDir]: Hex } } // index of INF == StoneColor
type ToAxis= {[key in InfDir] : HexAxis}
const dnToAxis: ToAxis = { NW: 'SE', W: 'E', SW: 'NE', NE: 'NE', E: 'E', SE: 'SE' }
type HSC = { hex: Hex, color: StoneColor, Aname?: string }

class InfMark extends Shape {
  static gE0: Graphics
  static gE1: Graphics
  static gInf(g: Graphics, color: string, w: number, wo: number, r: number) {
    if (C.dist(color, "black") < 10) w -= 1
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
  constructor(color: StoneColor, ds: HexAxis, dn?: InfDir) {
    let g: Graphics = (color === stoneColor0) ? InfMark.gE0 : InfMark.gE1
    super(g)
    this.mouseEnabled = false
    this.rotation = H.dirRot[ds]
    this[S.Aname] = `Inf[${color},${ds},${dn}-${this.id}]`  // for debug, not production
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
    this.distText.text = `${d}`
  }
  distText: Text
  rcText: Text
  color: string  // district color of Hex
  row: number
  col: number
  map: HexMap;  // Note: this.parent == this.map.hexCont [cached]
  stone: Stone
  capMark: CapMark; // set if recently captured (markCapture); prevents dragFunc using as dropTarget
  /** color of the Stone or undefined */
  get stoneColor(): StoneColor | undefined { return !!this.stone ? this.stone.color : undefined};
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
  setName(aname: string): this { this.Aname = aname; return this}
  /** set hexShape using color */
  setHexColor(color: string, district?: number) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    this.color = color
    let hexShape = this.hex(this.height/1.5, color)
    if (!!this.hexShape) this.removeChild(this.hexShape)
    this.addChildAt(hexShape, 0)
    this.hitArea = hexShape
    this.hexShape = hexShape
  }
  override toString() {
    return `Hex[${this.row},${this.col}]`
  }
  setStone(stone: Stone) {
    this.stone = stone
    this.map && this.map.allStones.push({Aname: this.Aname, hex: this, color: stone.color})
  }
  clearStone(): Stone {
    let stone = this.stone
    if (!!stone) {
      let map = this.map
      map.allStones = map.allStones.filter(hsc => hsc.hex !== this)
      this.stone = undefined
    }
    return stone
  }

  /** One Hex cell in the game, shown as a polyStar Shape of radius @ (XY=0,0) */
  constructor(color: string, radius: number, map: HexMap, row?: number, col?: number) {
    super();
    this.map = map
    let w = radius * Math.sqrt(3), h = radius * 1.5
    this.width = w
    this.height = h

    this.setNoInf(false) // assert: no infMarks to del/removeChild
    this.setHexColor(color)
    //if (!!xy) { this.x = xy.x; this.y = xy.y }

    if (row === undefined || col === undefined) return
    this.x += col * w + Math.abs(row % 2) * w/2
    this.y += row * h
    this.row = row
    this.col = col
    this.setBounds(-this.width/2, -this.height/2, this.width, this.height)

    let rc = `${row},${col}`
    this.Aname = this.hexShape.name = `Hex@[${rc}]`
    let rct = this.rcText = new Text(rc, F.fontSpec(26)); 
    rct.textAlign = 'center'; rct.y = -15
    this.addChild(rct)

    this.distText = new Text(``, F.fontSpec(20)); 
    this.distText.textAlign = 'center'; this.distText.y = 20
    this.addChild(this.distText)
    this.showText(false)
  }
  showText(vis = !this.rcText.visible) {
    this.rcText.visible = this.distText.visible = vis
  }
  /**
   * Is this Hex [already] influenced by color/dn? [for skipAndSet()]
   * @param dn dir of Influence: ds | revDir[ds]
   * @param color StoneColor
   * @returns true if Hex is StoneColor or full InfMark(ds) or InfMark.temp(dn)
   */
  isInf(color: StoneColor, dn: InfDir): boolean {
    return (this.stoneColor == color) || !!this.getInf(color, dn)
  }
  getInf(color: StoneColor, dn: InfDir): InfMark {
    return this.inf[color][dn]
  }
  /**
   * set temp = dn OR set temp = undefined if (temp != dn)
   * @param ds one of S.Dir3 (major axis)
   * @param color 
   * @returns true if a *new* InfMark is set.
   */
  setInf(color: StoneColor, dn: InfDir, ds: HexAxis = dnToAxis[dn], undo?: Undo): boolean {
    let infMark: InfMark
    if (!!this.getInf(color, dn)) return false
    infMark = new InfMark(color, ds, dn)
    this.inf[color][dn] = infMark
    undo && undo.addUndoRec(this, `delInf(${this},${color},${dn})`, () => { this.delInf(color, dn, false) })
    let revMark = this.getInf(color, H.dirRev[dn])
    if (!revMark || !revMark.parent) {
      // place first (of dn|rev[dn]) InfMark on HexMap:
      //this.parent.localToLocal(this.x, this.y, this.map.infCont, infMark)
      infMark.x = this.x; infMark.y = this.y // ASSERT: hexCont aligned with infCont; on mapCont
      this.map.infCont.addChild(infMark)
    }
    return !!infMark
  }

  /**
   * @param dn generally the primary axis
   * @param color 
   * @param rev if true also remove reverse dir
   */
  delInf(color: StoneColor, dn: InfDir, rev = true, undo?: Undo) {
    if (rev) this.delInf(color, H.dirRev[dn], false, undo)
    let infMark = this.getInf(color, dn)
    if (!infMark) return
    delete this.inf[color][dn]
    undo && undo.addUndoRec(this, `setInf(${this},${dn},${color})`, () => { this.setInf(color, dn) })
    if (!!infMark.parent) infMark.parent.removeChild(infMark)
    let revMark = this.getInf(color, H.dirRev[dn])
    if (!!revMark) this.map.infCont.addChild(revMark)
  }
  /** create empty inf for each color & InfDir */
  setNoInf(rmChild = true) {
    if (rmChild) stoneColors.forEach(color => {
      this.inf[color].forEach((inf: InfMark) => inf.parent.removeChild(inf))
    })
    this.inf = {}; this.inf[stoneColor0] = {}; this.inf[stoneColor1] = {};
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

  /** @param top set true to show capture mark on infCont (above stones) */
  markCapture(top = false) {
    if (this.capMark !== undefined) return // only 1 CapMark per Hex
    let cont = top ? this.map.infCont : this.map.markCont
    cont.addChild(this.capMark = new CapMark(this))
  }
  unmarkCapture(top = false) {
    if (this.capMark === undefined) return
    let cont = top ? this.map.infCont : this.map.markCont
    cont.removeChild(this.capMark)
    this.capMark = undefined
  }

  /** makes a colored hex, outlined with bgColor */
  hex(rad: number, color: string): Shape {
    let ns = new Shape(), tilt = 30
    ns.graphics.s(Hex.borderColor).dp(0, 0, rad+1, 6, 0, tilt) // s = beginStroke(color) dp:drawPolyStar
    ns.graphics.f(color).dp(0, 0, rad, 6, 0, tilt)             // f = beginFill(color)
    ns.rotation = H.dirRot[H.N]
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
  radius: number = TP.hexRad
  height: number = this.radius * 1.5;
  width: number = this.radius * Math.sqrt(3);
  hexCont: Container     // hex shapes on bottom
  markCont: Container    // showMark under Stones
  stoneCont: Container   // Stone in middle
  infCont: Container     // infMark on the top
  mark: Shape
  minRow: number = undefined               // Array.forEach does not look at negative indices!
  minCol: number = undefined
  maxCol: number = undefined
  get nCol() { return 1 + this.maxCol - this.minCol }
  /** Each occupied Hex, with the occupying StoneColor  */
  allStones: HSC[] = []                    // aka hexStones in Board
  skipHex: Hex;
  resignHex: Hex;

  // A color for each District:
  distColor = ["lightgrey","limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

  constructor(radius: number = TP.hexRad, mapCont?: Container) {
    super()
    this.radius = radius
    this.height = radius * Math.sqrt(3)
    this.width = radius * 1.5
    CapMark.capSize = this.width/2
    this.mark = new Shape();
    this.skipHex = new Hex(C.BROWN, TP.hexRad, this)
    this.skipHex.Aname = S_Skip
    this.resignHex = new Hex(C.BROWN, TP.hexRad, this)
    this.resignHex.Aname = S_Resign
    this.mark.graphics.beginFill(C.markColor).drawPolyStar(0, 0, radius, 6, 0, 30)
    if (!!mapCont) this.addToCont(mapCont)
  }
  addToCont(mapCont: Container): this {
    this.hexCont = new Container()     // hex shapes on bottom
    this.markCont = new Container()    // showMark under Stones
    this.stoneCont = new Container()   // Stone in middle
    this.infCont = new Container()     // infMark on the top
    // hexCont, stoneCont, markCont all x,y aligned
    mapCont.addChild(this.hexCont); this.hexCont[S.Aname] = "hexCont"
    mapCont.addChild(this.markCont); this.markCont[S.Aname] = "markCont"
    mapCont.addChild(this.stoneCont); this.stoneCont[S.Aname] = "stoneCont"
    mapCont.addChild(this.infCont); this.infCont[S.Aname] = "infCont"
    return this
  }

  initInfluence(): this { 
    InfMark.initStatic(this)
    return this 
  }
  centerOnContainer() {
    let hexRect = this.hexCont.getBounds()
    this.hexCont.x = this.markCont.x = this.stoneCont.x = this.infCont.x = -(hexRect.x + hexRect.width/2)
    this.hexCont.y = this.markCont.y = this.stoneCont.y = this.infCont.y = -(hexRect.y + hexRect.height/2)
  }

  update() { !!this.hexCont.parent && this.hexCont.stage.update()}
  addHex(row: number, col: number, district: number, dc: number): Hex {
    let color = this.distColor[dc]
    let hex = new Hex(color, this.radius, this, row, col)
    hex.district = district
    if (!this[row]) {
      this[row] = new Array<Hex>()
      if (row < (this.minRow || 1)) this.minRow = row
    }
    if (this.minCol === undefined || col < this.minCol) this.minCol = col
    if (this.maxCol === undefined || col > this.maxCol) this.maxCol = col
    this[row][col] = hex   // addHex to this Array<Array<Hex>>
    if (!!this.hexCont) this.hexCont.addChild(hex)
    this.link(hex)   // link to existing neighbors
    return hex
  }
  /** Array.forEach does not use negative indices */
  forEachHex(fn: (hex: Hex) => void) {
    for (let ir = this.minRow || 0; ir < this.length; ir++) {
      !!this[ir] && this[ir].forEach((hex: Hex) => fn(hex)) // ASSERT: col index is non-negative!
    }
  }
  findHex(fn: (hex: Hex) => boolean): Hex {
    let found: Hex
    for (let ir = this.minRow || 0; ir < this.length; ir++) {
      if (!this[ir]) continue
      found = this[ir].find((hex: Hex) => fn(hex))
      if (found !== undefined) return found
    }
    return found
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
    if (!hex || hex.Aname == S_Skip) {
      this.mark.visible = false
    } else {
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
   * @returns the Hex under mouse or null, if not a Hex (background)
   */
  hexUnderPoint(x: number, y: number): Hex {
    let obj = this.hexCont.getObjectUnderPoint(x, y, 1) // 0=all, 1=mouse-enabled (Hex, not Stone)
    if (obj instanceof Hex) return obj // Hex.hitArea = hexShape
    return null
  }
  /**
   * 
   * @param mh order of meta-hexes (2 or 3 for this game)
   * @param nh size of meta-hex (1..6)
   */
  makeAllDistricts(mh: number, nh: number) {
    let hexMap = this
    let mrc: RC = { col: Math.ceil(mh / 2), row: 2 }, district = 0
    let dirs: HexDir[] = ['NE', 'SE', 'S', 'SW', 'NW', 'N',] // N-S aligned!
    this.makeDistrict(nh, district++, mrc.row, mrc.col) // Central District [0]
    for (let ring = 1; ring < mh; ring++) {
      //mrc.row -= 1 // start to North
      mrc = hexMap.nextRowCol(mrc, 'NW', hexMap.nsTopo(mrc)) // NW + NE => 'N' for next metaHex
      dirs.forEach(dir => {
        // newMetaHexesOnLine(ring, rc, dir, district, dcolor, hexAry)
        for (let i = 0; i < ring; i++) {
          mrc = hexMap.nextRowCol(mrc, dir, hexMap.nsTopo(mrc))
          let hexAry = this.makeDistrict(nh, district++, mrc.row, mrc.col)
          let dcolor = this.pickColor(hexAry[0])
          hexAry.forEach(hex => hex.setHexColor(dcolor))
        }
      })
    }
    this.centerOnContainer()
  }
  pickColor(hex: Hex): string {
    let adjColor: string[] = [hex.map.distColor[0]], dist0 = hex.district
    H.dirs.forEach(hd => {
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
  makeDistrict(nh: number, district: number, mr, mc): Hex[] {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2 * nh - 1
    let dcolor = (district == 0) ? 0 : (1 + ((district + nh + mr) % 6))
    // irow-icol define topology of MetaHex composed of HexDistrict 
    let irow = (mr, mc) => {
      let ir = mr * dia - nh * (mcp + 1) + 1
      ir -= Math.floor((mc) / 2)              // - half a row for each metaCol
      return ir
    }
    let icol = (mr, mc, row) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh * 3 - 1) / 2))
      ic += (nh - 1)                        // from left edge to center
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col 
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    let row0 = irow(mr, mc), col0 = icol(mr, mc, row0), hex: Hex;
    let hexAry = []; hexAry['Mr'] = mr; hexAry['Mc'] = mc;
    hexAry.push(hex = this.addHex(row0, col0, district, dcolor)) // The *center* hex
    let rc: RC = { row: row0, col: col0 } // == {hex.row, hex.col}
    //console.groupCollapsed(`makelDistrict [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}:${district}-${dcolor}`)
    //console.log(`.makeDistrict: [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}`, hex)
    for (let ring = 1; ring < nh; ring++) {
      rc = this.nextRowCol(rc, 'W') // step West to start a ring
        // place 'ring' hexes along each axis-line:
        ; (H.dirs as InfDir[]).forEach(dir => rc = this.newHexesOnLine(ring, rc, dir, district, dcolor, hexAry))
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
   * @returns RC of next Hex to create (==? RC of original hex)
   */
  newHexesOnLine(n, rc: RC, dir: InfDir, district: number, dcolor: number, hexAry: Hex[]): RC {
    let hex: Hex
    for (let i = 0; i < n; i++) {
      hexAry.push(hex = this.addHex(rc.row, rc.col, district, dcolor))
      rc = this.nextRowCol(hex, dir)
    }
    return rc
  }

}