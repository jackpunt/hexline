
export type WH = { width: number, height: number };
export type XY = { x: number, y: number }; // less than a Point

/** Font things */
export namespace F {
  export function fontSpec(size: number = 32, font: string = S.defaultFont) { return ""+size+"px "+font}
  export function timedPromise<T>(ms: number, v?: T): Promise<T> {
    return new Promise((res, rej) => setTimeout(()=>res(v), ms))
  }
}

/** Math things */
export namespace M {
  /**  @return given value rounded to n decimal places. */
  export function decimalRound(value:number, n: number): number {
    let d = 10 ** n
    return Math.round(value*d)/d
  }
}
/** Hexagonal canonical directions */
export enum Dir { C, NE, E, SE, SW, W, NW}

/** String things */
export namespace S {
  export const C: string = "C"         // Center of ChooseDir buttons
  export const N: string = "N"
  export const E: string = "E"
  export const S: string = "S"
  export const W: string = "W"
  export const NE: string = "NE"
  export const SE: string = "SE"
  export const SW: string = "SW"
  export const NW: string = "NW"

  export const dirs: string[] = [NE, E, SE, SW, W, NW]; // standard direction signifiers () ClockWise
  export const dirRot: object = { N: 0, E: 90, S: 180, W: 270, NE: 30, SE: 150, SW: 210, NW: 330 }
  export const dirRev: object = { N: S, S: N, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }
  export const defaultFont: string = "sans-serif"

  export const rgbColor: string = "rgbColor"// card prop

  export const scaled: string = "scaled"    // Event name on ScaledContainer
  export const aname:  string = "Aname"     // anonymous function field name, any object name
  export const add:    string = "add"       // HexEvent type add Stone to board
  export const remove: string = "remove"    // HexEvent type removeStone from board
  
  export const onTurnStart:  string = "onTurnStart"  // onTrigger for Effects
  export const onMove:       string = "onMove"       // onTrigger for Effects
  
  export const turn:    string = "turn"       // ValueEvent on Table & Counter name
  export const turnOver:string = "turnOver"   // ValueEvent on Table: endOfTurn (before setNextPlayer)
  export const undo:    string = "undo"       // ValueEvent on Table

  export const click:   string = "click"      // MouseEvent on Stage
  export const clicked: string = "clicked"    // CardEvent type
  export const pressmove:string= "pressmove"  // Createjs Event
  export const pressup: string = "pressup"    // Createjs Event

  export const actionEnable: string = "actionEnable" // RoboEvent type
  export const doNotDrag:   string = "doNotDrag"   // mouse Target property for Dragger

}
/** color strings */
export namespace C {
  /** add alpha value to an "rgb(r,g,b)" string */
  export function rgba(rgb: string, a: number): string { return "rgba" + rgb.substring(3, rgb.length - 1) + ", "+a+")" }
  export const RED:         string = "RED"          // nominal player color
  export const BLUE:        string = "BLUE"         // nominal player color
  export const GREEN:       string = "GREEN"        // nominal player color
  export const ORANGE:      string = "ORANGE"       // nominal player color
  export const PURPLE:      string = "PURPLE"       // nominal player color
  export const YELLOW:      string = "YELLOW"       // nominal player color
  export const BLACK:       string = "BLACK"        // vcPlayer color
  export const BROWN:       string = "rgba(185, 83, 0, 1)"

  export const black:       string = "black"        // text color
  export const white:       string = "white"
  export const vpWhite:     string = "rgba(255, 255, 255,  1)"
  export const briteGold:   string = "rgba(255, 213,  77,  1)"
  export const coinGold:    string = "rgba(235, 188,   0,  1)"
  export const debtRust:    string = "rgba(225,  92,   0,  1)" // Rust color
  export const legalGreen:  string = "rgba(  0, 100,   0, .3)"
  export const legalRed:    string = "rgba(100,   0,   0, .3)"
  export const demoRed:     string = "rgba(100,   0,   0, .8)"
  export const targetMark:  string = "rgba(190, 250, 190, .8)"
  export const debtMark:    string = "rgba( 50,   0,   0, .3)"
  export const markColor:   string = "rgba( 80,  80,  80, .3)"
  export const scaleBack:   string = "rgba(155, 100, 150, .3)"
  export const policyBack:  string = "rgba(255, 100, 200, .3)"
  export const auctionBack: string = "rgba(180, 230, 180, .3)"
  export const discardBack: string = "rgba(120, 230, 120, .6)"
  export const counterColor:string = "lightblue"
  export const debtCounter: string = "lightgreen"
  export const phaseCounter:string = "lightgreen"
  export const dropTarget:  string = "lightpink"
  export const roundCounter:string = "lightgreen"
  export const turnCounter: string = "lightgreen"
  export const policySlots: string = "rgba(255, 100, 200, .3)";

}

// Copied from: https://dev.to/svehla/typescript-object-fromentries-389c
// export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
// type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
// type Cast<X, Y> = X extends Y ? X : Y
// type FromEntries<T> = T extends [infer Key, any][]
//   ? { [K in Cast<Key, string>]: Extract<ArrayElement<T>, [K, any]>[1]}
//   : { [key in string]: any }

// export type FromEntriesWithReadOnly<T> = FromEntries<DeepWriteable<T>>


// declare global {
//    interface ObjectConstructor {
//      fromEntries<T>(obj: T): FromEntriesWithReadOnly<T>
//   }
// }

export class Obj {
  /** like Object.fromEntries(...[string, any]) 
   * @param rv supply empty object (of prototype)
   */
  static fromEntries<T extends object>(ary: [string, any][], rv:T = {} as T): T {
    ary.forEach(([k, v]) => { rv[k] = v }) // QQQQ: is Object.fromEntries() sufficient? is it just <T>?
    return rv
  }
  /** clone: make a shallow copy of obj, using Obj.fromEntries(ary, rv?:T) */
  static fromEntriesOf<T extends object>(obj: T): T {
    return Obj.fromEntries(Object.entries(obj), Object.create(obj) as T)
  }
  /** clone: make a shallow copy of obj, using Object.fromEntries(ary) */
  static objectFromEntries<T extends object>(obj: T): T {
    return Object.fromEntries(Object.entries(obj)) as T // Object.fromEntries now available in TypeScript!
  }
}


