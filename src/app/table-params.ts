import { S } from "./basic-intfs";

export class TP {
  static numPlayers = 2;
  static mapRows:number = 7;   /// standard: 6
  static mapCols:number = 12;  /// standard: 15
  static playerColors: string[] = ["RED", "BLUE", "GREEN", "ORANGE", "PURPLE", "YELLOW"]; // REQUIRED!
  static playerRGBcolors: string[] = []; // filled by Player.initialize()
  static autoEvent: number | true = 2000;
  
  /** exclude whole Extension sets */
  static excludeExt: string[] = ["Policy", "Event", "Roads", "Transit"]; // url?ext=Transit,Roads
  // timeout: see also 'autoEvent'
  static moveDwell:  number = 600
  static flashDwell: number = 500
  static flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static bgColor: string = "rgba(155, 100, 150, .3)";
  static networkUrl: string = "wss://game7.thegraid.com:8444";  // URL to cgserver (wspbserver)
  static networkGroup: string = "citymap:game1";
}