import { C } from "./basic-intfs";

//export const stoneColors = ['black', 'white'] as const
export const stoneColors = ['blue', 'red'] as const
export const stoneColor0 = stoneColors[0]
export const stoneColor1 = stoneColors[1]
//type stoneColorTuple = typeof stoneColors
export type StoneColor = typeof stoneColors[number]
export function otherColor(color: StoneColor): StoneColor { return color == stoneColors[0] ? stoneColors[1] : stoneColors[0] }

export class TP {
  static numPlayers = 2;
  static mHexes = 3    // number hexes on side of Meta-Hex
  static nHexes = 3    // number of Hexes on side of District
  static nVictory = 4  // number of Districts to control
  static nMinControl  = (TP.nHexes <= 1) ? 1 : TP.nHexes + 1 // [1, 1, 3, 4, 5, ...]
  static nDiffControl = (TP.nHexes <= 1) ? 0 : TP.nHexes - 1 // [0, 0, 1, 2, 3, ...]
  /** set victory conditions for (nh, mh) */
  static fnHexes(nh: number, mh: number) {
    TP.mHexes = mh
    TP.nHexes = nh
    TP.nVictory = Math.ceil(TP.ftHexes(mh) / 2)
    TP.nMinControl  = (nh <= 1) ? 1 : nh + 1 // [1, 1, 3, 4, 5, ...]
    TP.nDiffControl = (nh <= 1) ? 1 : nh - 1 // [0, 0, 1, 2, 3, ...]
  }
  /** an odd number: 1, 7, 19, 37, 61, 97, ... */
  static ftHexes(n: number): number { return (n == 1) ? 1 : 6 * (n-1) + TP.ftHexes(n - 1) }

  /** exclude whole Extension sets */
  static excludeExt: string[] = ["Policy", "Event", "Roads", "Transit"]; // url?ext=Transit,Roads
  // timeout: see also 'autoEvent'
  static moveDwell:  number = 600
  static flashDwell: number = 500
  static flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static bgColor: string = C.BROWN
  static networkUrl: string = "wss://game7.thegraid.com:8444";  // URL to cgserver (wspbserver)
  static networkGroup: string = "hexline:game1";
}