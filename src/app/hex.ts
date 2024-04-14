import { json, stime } from "@thegraid/common-lib";
import { C, Constructor, F, RC, S } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, Shape, Text } from "@thegraid/easeljs-module";
import { GamePlay0 } from "./game-play";
import { EwDir, H, HexAxis, HexDir, InfDir, NsDir } from "./hex-intfs";
import { IMove } from "./move";
import { Stone } from "./table";
import { PlayerColor, PlayerColorRecord, TP, otherColor, playerColor0, playerColorRecord, playerColorRecordF, playerColors } from "./table-params";
import { S_Resign as S_Resign0, S_Skip as S_Skip0, IdHex, LINKS, Hex as Hex0, HexM as HexM0, Hex2 as Hex20, HexMap as HexMap0, MapCont, NamedContainer, HexConstructor, HexCont } from "@thegraid/hexlib";

export  type IHex = IdHex ;
export const S_Resign = S_Resign0;
export const S_Skip = S_Skip0;

// Types for Influence
type INF   = { [key in InfDir]?: number }
type INFM   = { [key in HexAxis]?: InfMark }
// types for Topo:
type DCR    = { [key in "dc" | "dr"]: number }  // Delta for Col & Row
type TopoEW = { [key in EwDir]: DCR }
type TopoNS = { [key in NsDir]: DCR }
type Topo = TopoEW | TopoNS

const mapContNames = ['hexCont', 'stoneCont', 'infCont', 'markCont'] as const;
type MapConts = { [key in (typeof mapContNames[number])]: NamedContainer };

export type HSC = { hex: Hex, sc: PlayerColor, Aname: string }
export function newHSC(hex: Hex, sc: PlayerColor, Aname = hex.Aname) { return { Aname, hex, sc } }
class InfMark extends Shape {
  /** Note: requires a Canvas for nameToRgbaString() */
  static gColor(sc: PlayerColor, g: Graphics = new Graphics()) {
    let alpha = '.85'
    let lightgreyA = C.nameToRgbaString('lightgrey', '.5')
    let r = Stone.height - 1, w = 5, wo = w / 2, wos = sc === playerColor0 ? wo : -wo
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
  static infG = playerColorRecord(undefined as unknown as Graphics, undefined as unknown as Graphics)
  static setInfGraphics(): PlayerColorRecord<Graphics> {
    return InfMark.infG = playerColorRecordF<Graphics>(sc => InfMark.gColor(sc, InfMark.infG[sc]))
  }
  /** @param ds show Influence on Axis */
  constructor(sc: PlayerColor, ds: HexAxis, x: number, y: number) {
    super(InfMark.infG[sc] || InfMark.setInfGraphics()[sc])
    this.mouseEnabled = false
    this.rotation = H.dirRot[ds]
    this.x = x; this.y = y
    this[S.Aname] = `Inf[${TP.colorScheme[sc]},${ds},${this.id}]`  // for debug, not production
  }
}

/** CapMark indicates if hex has been captured. */
class CapMark extends Shape {
  static capSize = 4   // depends on HexMap.height
  constructor(hex: Hex2, color = Hex.capColor) {
    super()
    this.paint(color)
    hex.cont.parent.localToLocal(hex.x, hex.y, hex.map.mapCont.markCont, this)
  }
  paint(color = Hex.capColor) {
    this.graphics.c().f(color).dp(0, 0, CapMark.capSize, 6, 0, 30)
  }
}






function InfMixin<Ht extends Constructor<Hex0>> (Base: Ht)/* : Constructor<{}> & T*/ {
  return class InfHex extends Base {
    inf: string;
  }
}

function InfColorMixin<Ht extends Constructor<Hex0>> (Base: Ht) {
  const rv = class InfColorHex extends Base {

  declare map: HexM0<Hex20>; // <=== TODO: FIX THIS (and map: above) HexMap<Hex0> or HexMap<Hx>

  /** color of current Stone on this Hex (or undefined) */
  playerColor: PlayerColor = undefined;
  readonly inf = playerColorRecord<INF>({},{})

  iMove(sc = this.playerColor): IMove { return { hex: this.iHex, playerColor: sc, Aname: this.toString(sc) }}

  json(sc = this.playerColor) { return `{"p":"${sc || 'u'}","r":${this.rowsp},"c":${this.colsp}}` }

  /** set hex.playerColor and push HSC on allStones */
  setColor(playerColor: PlayerColor): this {
    // console.log(stime(this, `.setColor: ${this} ${playerColor}`), json(this.inf), this.map.Aname)
    if (this.playerColor !== undefined) {
      console.warn(`Hex already occupied ${this.Aname}: ${playerColor} -> ${this.playerColor}`)
      debugger; // hex already occupied
    }
    this.playerColor = playerColor
    //let hexm = new HexMapLayer(this.map, this, playerColor)
    //let hex = hexm.addHex(this)
    let hsc: HSC = newHSC(this, playerColor)
    this.map?.allStones.push(hsc) // no push: Aname == nextHex
    return this
  }
  clearColor(): PlayerColor {
    let color = this.playerColor, hscAry = this.map.allStones
    if (color !== undefined && this.map !== undefined) {
      // put filtered result back into original array:
      hscAry.splice(0, hscAry.length, ...hscAry.filter(hsc => hsc.hex !== this))
    }
    this.playerColor = undefined
    // console.log(stime(this, `.clearColor: ${this} ${this.playerColor ?? '-'}`), json(this.inf), this.map.Aname)
    return color
  }
  /** colorScheme(playerColor)@rcs */
  override toString(playerColor = this.playerColor) {
    return `${TP.colorScheme[playerColor]}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  /** hex.rcspString => COLOR@[ r, c] | 'COLOR@Skip   ' , 'COLOR@Resign ' */
  override rcspString(sc = this.playerColor) {
    return `${TP.colorScheme[sc]}@${this.rcsp}`
  }

  /**
   * Is this Hex [already] influenced by color/dn? [for skipAndSet()]
   * @param color PlayerColor
   * @param dn dir of Influence: ds | revDir[ds]
   * @returns true if Hex is PlayerColor or has InfMark(color, dn)
   */
  isInf(color: PlayerColor, dn: InfDir) { return this.inf[color][dn] > 0}
  getInf(color: PlayerColor, dn: InfDir) { return this.inf[color][dn] || 0 }
  setInf(color: PlayerColor, dn: InfDir, inf: number) { return this.inf[color][dn] = inf }

  /**
   * @param inc is influence *passed-in* to Hex; hex get [inc or inc+1]; *next* gets [inc or inc-1]
   * @param test after hex.setInf(inf) and hex.propagateIncr(nxt), apply test(hex)
   */
  propagateIncr(color: PlayerColor, dn: InfDir, inc: number, test?: (hex: Hx) => void) {
    let inf = this.playerColor === color ? inc + 1 : inc // inc >= 0, inf > 0
    this.setInf(color, dn, inf)
    let nxt = this.playerColor === color ? inf : inf - 1
    if (nxt > 0) this.links[dn]?.propagateIncr(color, dn, nxt, test);
    if (test) test(this as any as Hx);
  }

  /**
   * Pass on based on *orig/current* inf, not the new/decremented inf.
   * @param inc is influence *passed-in* from prev Hex; *this* gets inc; pass-on [inc or inc-1]
   * @param test after hex.setInf(infn) and hex.propagateDecr(nxt), apply test(hex)
   */
  propagateDecr(color: PlayerColor, dn: InfDir, inc: number, test?: (hex: Hx) => void) {
    let inf0 = this.getInf(color, dn)
    let inf = this.playerColor === color ? inc + 1 : inc
    this.setInf(color, dn, inf)
    let nxt = this.playerColor === color ? inf : Math.max(0, inf - 1)
    let nhex = this.links[dn]
    if (inf0 > 0) nhex  && nhex.propagateDecr(color, dn, nxt, test); // pass-on a smaller number
    if (test) test(this as any as Hx);
  }

  /** create empty INF for each color */
  clearInf() { playerColors.forEach(c => this.inf[c] = {}) }

  /** true if hex influence by 1 or more Axies of color */
  isThreat(color: PlayerColor) {
    return !!Object.values(this.inf[color]).find(inf => (inf > 0))
  }
  isAttack2(color: PlayerColor) {
    let attacks = 0, infs = this.inf[color], adds = {}
    H.axis.forEach(ds => adds[ds] = 0)
    return !!Object.entries(infs).find(([dn, inf]) =>
      (inf > 0) && (++adds[H.dnToAxis[dn]] == 1) && (++attacks >= 2)
    )
  }
  /** @return true if Hex is influenced on 2 or more Axies of color */
  isAttack(color: PlayerColor): boolean {
    let attacks = new Set<HexAxis>(), infs = this.inf[color]
    let dirMap = TP.parallelAttack ? H.dnToAxis2 : H.dnToAxis;
    return !!Object.entries(infs).find(([dn, inf]) =>
      (inf > 0) && (attacks.add(dirMap[dn]).size >= 2)
    )
  }
  /** @return true if Hex has a Stone (of other color), and is attacked */
  isCapture(color: PlayerColor): boolean {
    return (this.playerColor !== undefined) && (this.playerColor !== color) && this.isAttack(color)
  }
  }
 return rv;
}

class H1 extends InfColorMixin(Hex20) {
  constructor(map: HexM<Hex20>, row: number, col: number, name = Hex0.aname(row, col)) {
    super(map, row, col, name)
    this.cont
  }

}

// class extend from generic: https://github.com/Microsoft/TypeScript/issues/4890
// mixin documentation: https://github.com/microsoft/TypeScript/pull/13743
/**
 * Base Hex with ColorHex: playerColor, infl & associated methods.
 */
export class Hex extends InfColorMixin(Hex0) {
  static capColor = H.capColor1 // dynamic bind in GamePlay.doProtoMove()
  static override ofMap(ihex: IdHex, otherMap: HexMap0<Hex0>) {
    return Hex0.ofMap(ihex, otherMap) as Hex;
  }
  constructor(map: HexM<Hex>, row: number, col: number, name = Hex0.aname(row, col)) {
    super(map, row, col, name)
    this.Aname = name;
  }
}
type Hx = Hex;

/**
 * One Hex cell in the game, shown as a polyStar Shape
 * hexlib.Hex -> hexlib.Hex2 (graphics) + ColorHex (playerColor & influence)
 */
export class Hex2 extends InfColorMixin(Hex20) {
//  cont: HexCont; x: number; y: number;  // <=== TODO: these should be inherited from Hex20!!

  capMark: CapMark; // shown on this.map.markCont
  stone: Stone      // shown on this.map.stoneCont
  stoneIdText: Text     // shown on this.map.markCont
  infm: Record<PlayerColor,INFM> = playerColorRecord({},{})

  /**
   * Hex2 cell with graphics; shown as a polyStar Shape of radius @ (XY=0,0)
   *
   * this.mapCont.hexCont.addChild(this.cont) <-- this.hexShape
   *
   * this.mapCont.stoneCont.addChild(stoneCont) <-- new Stone(): Shape
   */
  constructor(map: HexMap0<Hex20>, row: number, col: number, name?: string) {
    super(map, row, col, name);
    this.setHexColor("grey")  // until setHexColor(by district)
    this.stoneIdText = new Text('', F.fontSpec(26))
    this.stoneIdText.textAlign = 'center'; this.stoneIdText.regY = -20;
  }
  override get mapCont() { return this.map.mapCont as (MapCont & MapConts) }

  // declare map: HexMap<Hex2>;

  // static ofMap(ihex: IdHex, otherMap: HexMap0<Hex0>): Hex0 {
  //   return Hex0.ofMap(ihex, otherMap) as Hex2;
  // }

  /** colorScheme(playerColor)@rcs */
  override toString(playerColor = this.playerColor) {
    return `${TP.colorScheme[playerColor] ?? this.Aname}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  /** hex.rcspString => COLOR@[ r, c] | 'COLOR@Skip   ' , 'COLOR@Resign ' */
  override rcspString(sc = this.playerColor) {
    return `${TP.colorScheme[sc]}@${this.rcsp}`
  }

  // multiple inheritance!!  as Hex; how to find super above mid-class
  override setInf(color: PlayerColor, dn: InfDir, inf: number): number {
    super.setInf(color, dn, inf)
    this.showInf(color, dn, (this.playerColor !== color && (inf > 0 || super.isInf(color, H.dirRevEW[dn]))))
    return inf
  }
  static infVis = true   // set by ParamGui('showInf')
  showInf(color: PlayerColor, dn: InfDir, show = true) {
    let ds: HexAxis = H.dnToAxis[dn], infMark = this.infm[color][ds]  // infm only on [ds]
    if (show) {
      if (!infMark) {
        infMark = this.infm[color][ds] = new InfMark(color, ds, this.x, this.y)
        this.mapCont.infCont.addChild(infMark)
      }
      infMark.visible = Hex2.infVis
    } else {
      //infMark?.parent?.removeChild(infMark)
      infMark && (infMark.visible = false)
    }
  }
  override clearInf(): void {
    playerColors.forEach(color => {
      for (let mark of Object.values(this.infm[color]))
        //mark?.parent?.removeChild(mark)
        mark && (mark.visible = false)
    })
    super.clearInf();
  }

  /** make and show a CapMark on this Hex2 */
   markCapture(mc = Hex.capColor) {
    if (this.capMark === undefined) { this.capMark = this.map.mapCont.markCont.addChild(new CapMark(this, mc)) }
    else (this.capMark.paint(mc))
    this.capMark.visible = true
  }
   unmarkCapture() {
    this.capMark && (this.capMark.visible = false)
  }

  setStoneId(id: number | string) {
    let sid = typeof id === 'number' ? `${id}` : id
    this.stoneIdText.text = this.stoneIdText ? sid : ''
    this.stoneIdText.color = TP.Black_White[otherColor(this.stone.color)]
    const cont = this.mapCont.stoneCont;
    this.cont.parent.localToLocal(this.x, this.y, cont, this.stoneIdText)
    cont.addChild(this.stoneIdText)
  }
  clearStoneId() {
    this.stoneIdText?.parent?.removeChild(this.stoneIdText)
  }

  /** make a Stone on this Hex2 (from addStone(color)) */
  // setColor returns a new Hex2 on a new HexMap
  override setColor(playerColor: PlayerColor): this {
    // console.log(stime(this, `.setColor0: ${this} ${playerColor}`), json(this.inf), this.map.Aname)
    let hex = super.setColor(playerColor)
    if (playerColor !== undefined) {
      let stone = this.stone = new Stone(playerColor)
      stone[S.Aname] = `[${this.row},${this.col}]`
      let cont: Container = this.mapCont.stoneCont;
      this.cont.parent.localToLocal(this.x, this.y, cont, stone)
      cont.addChild(stone)
    } // else this.clearColor() has been called
    this.cont.updateCache();
    // console.log(stime(this, `.setColor1: ${this} ${playerColor}`), json(this.inf))
    return hex
  }
  /** removeChild(stone) & HSC from map.allStones. */
  override clearColor(): PlayerColor {
    this.clearStoneId()
    this.stone?.parent?.removeChild(this.stone)
    this.stone = undefined
    const rv = super.clearColor()
    // console.log(stime(this, `.clearColor: ${this} ${this.playerColor ?? '-'}`), json(this.inf), this.map.Aname)
    return rv;
  }

  /** set hexShape using color */
  override setHexColor(color: string, district?: number) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    this.distColor = color
    this.hexShape.paint(color);
  }

  override lastHex(ds: InfDir): Hex2 {
    return super.lastHex(ds) as Hex2
  }
}


export interface HexM<T extends Hex0> extends HexM0<T> {
  readonly allStones: HSC[]       // all the Hex with a Stone/Color
  //used by GamePlay:
  readonly skipHex: T;
  readonly resignHex: T;
}
/**
 * hexline: HexMap
 *
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
export class HexMap<T extends Hex> extends HexMap0<T>  {
  // A color for each District:

  /** Each occupied Hex, with the occupying PlayerColor  */
  override readonly allStones: HSC[] = []              // aka hexStones in Board (readonly when we stop remove/filter)
  readonly skipHex: Hex;
  readonly resignHex: Hex;

  /** height of hexagonal cell (1.5 * radius) */
  height: number = this.radius * 1.5;
  /** width of hexagonal cell  (H.sqrt3 * radius */
  width: number = this.radius * H.sqrt3

  /** bounding box: XYWH = {0, 0, w, h} */
  get wh() {
    let hexRect = this.mapCont.hexCont.getBounds()
    let wh = { width: (hexRect?.width ?? 0) + 2 * this.width, height: (hexRect?.height ?? 0) + 2 * this.width }
    return wh
  }

  /**
   * HexMap: TP.mh X TP.nh hexes in districts; with a Mark, an off-map: skipHex & resignHex
   *
   * Basic map is non-GUI, addToMapCont uses Hex2 elements to enable GUI interaction.
   * @param addToMapcont use Hex2 for Hex, make Containers: hexCont, infCont, markCont, stoneCont
   */
  constructor(radius: number = TP.hexRad, addToMapCont = false, hexC: Constructor<Hex0> = Hex0, Aname = 'mainMap') {
    super(radius, addToMapCont, hexC, Aname); // Array<Array<Hex>>()
    this.height = radius * H.sqrt3
    this.width = radius * 1.5
    CapMark.capSize = this.width/2
    this.skipHex = new Hex(this as any as HexM<T>, -1, -1, S_Skip)
    this.resignHex = new Hex(this as any as HexM<T>, -1, -2, S_Resign)
    if (addToMapCont) this.addToMapCont(this.hexC as Constructor<T>);

  }

  override mapCont: MapCont & MapConts;
  override addToMapCont(hexC?: Constructor<T> | undefined): this {
    return super.addToMapCont(hexC, mapContNames);
  }

  initInfluence(): this { InfMark.setInfGraphics(); return this }

  override calculateRC0(): RC {
    const { nh, mh } = this, cm = H.sqrt3_2; // ~.8 (.865)
    const offs = Math.ceil(2 * nh * (mh - .5)); // col offset could be smaller for EwTopo
    const col = Math.ceil(offs * cm), row = offs;
    return {col, row};
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
      hex.setColor(oldHex.playerColor)
    })
  }

}
/** Marker class for HexMap used by GamePlayD */
export class HexMapD extends HexMap<Hex> {

}
