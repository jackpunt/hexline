import { RC } from "@thegraid/common-lib";

/** Hexagonal canonical directions */
export enum Dir { C, NE, E, SE, SW, W, NW }
export type HexDir = 'NE' | 'EN' | 'E' | 'ES' | 'SE' | 'S' | 'SW' | 'WS' | 'W' | 'WN' | 'NW' | 'N';
export type XYWH = { x: number, y: number, w: number, h: number } // like a Rectangle
export type EwDir = "NE" | "E" | "SE" | "SW" | "W" | "NW";
export type NsDir = "EN" | "ES" | "S" | "WS" | "WN" | "N";
// assumes topoEW:
export type InfDir = EwDir;
export type HexAxis = Exclude<InfDir, 'SW' | 'W' | 'NW'>

type DCR    = { [key in "dc" | "dr"]: number }  // Delta for Col & Row
export type TopoEW = { [key in EwDir]: DCR }
export type TopoNS = { [key in NsDir]: DCR }
export type Topo = TopoEW | TopoNS

/** Hex things */
export namespace H {
  export const sqrt3 = Math.sqrt(3)  // 1.7320508075688772
  export const sqrt3_2 = Math.sqrt(3) / 2;
  export const infin = String.fromCodePoint(0x221E)
  export const C: 'C' = "C"; // not a HexDir, but identifies a Center
  export const N: HexDir = "N"
  export const S: HexDir = "S"
  export const E: HexDir = "E"
  export const W: HexDir = "W"
  export const NE: HexDir = "NE"
  export const SE: HexDir = "SE"
  export const SW: HexDir = "SW"
  export const NW: HexDir = "NW"
  export const EN: HexDir = "EN"
  export const ES: HexDir = "ES"
  export const WS: HexDir = "WS"
  export const WN: HexDir = "WN"

  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  export const ewEvenRow: TopoEW = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }
  }
  export const ewOddRow: TopoEW = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: { dc: 0, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: 0, dr: -1 }
  }
  export const nsEvenCol: TopoNS = {
    EN: { dc: +1, dr: -1 }, N: { dc: 0, dr: -1 }, ES: { dc: +1, dr: 0 },
    WS: { dc: -1, dr: 0 }, S: { dc: 0, dr: +1 }, WN: { dc: -1, dr: -1 }
  }
  export const nsOddCol: TopoNS = {
    EN: { dc: 1, dr: 0 }, N: { dc: 0, dr: -1 }, ES: { dc: 1, dr: 1 },
    WS: { dc: -1, dr: 1 }, S: { dc: 0, dr: 1 }, WN: { dc: -1, dr: 0 }
  }
  export function nsTopo(rc: RC): TopoNS { return (rc.col % 2 == 0) ? H.nsEvenCol : H.nsOddCol };
  export function ewTopo(rc: RC): TopoEW { return (rc.row % 2 == 0) ? H.ewEvenRow : H.ewOddRow };

  export const axis: HexAxis[] = [NE, E, SE];            // bi-directional inf axis
  export const ewDirs: EwDir[] = [NE, E, SE, SW, W, NW]; // directions for EwTOPO
  export const nsDirs: NsDir[] = [EN, ES, S, WS, WN, N]; // directions for NsTOPO
  export const infDirs: InfDir[] = ewDirs as InfDir[]    // until we extract from typeof InfDir
  export const dirRot: {[key in HexDir] : number} = { N: 0, NE: 30, EN: 60, E: 90, ES: 120, SE: 150, S: 180, SW: 210, WS: 240, W: 270, WN: 300, NW: 330 }
  export const dirRev: {[key in HexDir] : HexDir} = { N: S, S: N, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE, ES: WN, EN: WS, WS: EN, WN: ES }
  export const dirRevEW: {[key in EwDir] : EwDir} = { E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }
  export const dirRevNS: {[key in NsDir] : NsDir} = { N: S, S: N, EN: WS, ES: WN, WS: EN, WN: ES }
  export const rotDir: { [key: number]: HexDir } = { 0: 'N', 30: 'NE', 60: 'EN', 90: 'E', 120: 'ES', 150: 'SE', 180: 'S', 210: 'SW', 240: 'WS', 270: 'W', 300: 'WN', 330: 'NW', 360: 'N' }

  export const dnToAxis: { [key in InfDir]: HexAxis } = { NW: 'SE', W: 'E', SW: 'NE', NE: 'NE', E: 'E', SE: 'SE' }
  export const dnToAxis2: { [key in InfDir]: InfDir } = { NW: 'NW', W: 'W', SW: 'SW', NE: 'NE', E: 'E', SE: 'SE' }

  export const capColor1:   string = "rgba(150,  0,   0, .8)"  // unplayable: captured last turn
  export const capColor2:   string = "rgba(128,  80, 80, .8)"  // protoMove would capture
  export const sacColor1:   string = "rgba(228,  80,  0, .8)"  // unplayable: sacrifice w/o capture
  export const sacColor2:   string = "rgba(228, 120,  0, .6)"  // isplayable: sacrifice w/ capture
  export const fjColor:     string = "rgba(228, 228,  0, .8)"  // ~unplayable: jeopardy w/o capture
}
