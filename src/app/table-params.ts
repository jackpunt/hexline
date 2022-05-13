import { C } from "@thegraid/createjs-lib";

export const stoneColors = ['b', 'w'] as const
export const stoneColor0 = stoneColors[0]
export const stoneColor1 = stoneColors[1]
//type stoneColorTuple = typeof stoneColors
export type StoneColor = typeof stoneColors[number]
export function otherColor(color: StoneColor): StoneColor { return color === stoneColor0 ? stoneColor1 : stoneColor0 }

export type StoneColorRecord<T> = Record<StoneColor, T>
export function stoneColorRecord<T>(b: T = null, w: T = null): StoneColorRecord<T> { return { 'b': b, 'w': w } };
export function stoneColorRecordF<T>(f: (sc: StoneColor) => T) { return stoneColorRecord(f(stoneColor0), f(stoneColor1)) }
export class TP {
  static allowSuicide = true;
  static yield = true
  static minYield = 20
  static maxPlys = 4     // for robo-player lookahead
  static maxBreadth = 7  // for robo-player lookahead
  static nPerDist = 4    // samples per district
  static Black_White = stoneColorRecord('BLACK', 'WHITE')
  static Blue_Red = stoneColorRecord('BLUE', 'RED')
  static schemeNames = ['Black_White', 'Blue_Red']
  static colorScheme: Record<StoneColor, string> = TP.Black_White
  static numPlayers = 2;
  static mHexes = 2    // number hexes on side of Meta-Hex
  static nHexes = 1    // number of Hexes on side of District
  static nVictory = 4  // number of Districts to control
  static nMinControl  = (TP.nHexes <= 1) ? 1 : TP.nHexes + 1 // [1, 1, 3, 4, 5, ...]
  static nDiffControl = (TP.nHexes <= 1) ? 0 : TP.nHexes - 1 // [0, 0, 1, 2, 3, ...]
  static hexRad = 50
  static log = 0
  /** set victory conditions for (nh, mh) */
  static fnHexes(nh: number, mh: number) {
    TP.mHexes = mh
    TP.nHexes = nh
    TP.nVictory = Math.ceil(TP.ftHexes(mh) / 2)
    TP.nMinControl  = (nh <= 1) ? 1 : nh + 1 // [1, 1, 3, 4, 5, ...]
    TP.nDiffControl = (nh <= 1) ? 1 : nh - 1 // [0, 0, 1, 2, 3, ...]
  }
  /** number of hexes in a metaHex of order n; number of districts(n=TP.mHexes)
   * @return an odd number: 1, 7, 19, 37, 61, 97, ... */
  static ftHexes(n: number): number { return (n <= 1) ? n : 6 * (n-1) + TP.ftHexes(n - 1) }

  /** exclude whole Extension sets */
  static excludeExt: string[] = ["Policy", "Event", "Roads", "Transit"]; // url?ext=Transit,Roads
  // timeout: see also 'autoEvent'
  static moveDwell:  number = 600
  static flashDwell: number = 500
  static flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static bgColor: string = 'peru'// C.BROWN
  static borderColor: string = TP.bgColor; //'burlywood'
  static networkUrl: string = "wss://game7.thegraid.com:8444";  // URL to cgserver (wspbserver)
  static networkGroup: string = "hexline:game1";
}