import { C } from "./basic-intfs";

export const stoneColors = ['black', 'white'] as const // StoneColor is not: string C.black
//type stoneColorTuple = typeof stoneColors
export type StoneColor = typeof stoneColors[number]
export function otherColor(color: StoneColor): StoneColor { return color == stoneColors[0] ? stoneColors[1] : stoneColors[0] }

export class TP {
  static numPlayers = 2;
  
  static nHexes = 4    // number of Hexes on side of District
  static nVictory = 4  // number of Districts to control
  static nMinControl = TP.nHexes + 2
  static nDiffControl = 3  //
  
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