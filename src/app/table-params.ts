import { playerColorRecord, TP as TPLib } from "@thegraid/hexlib";
export { otherColor, PlayerColor, playerColor0, playerColor1, PlayerColorRecord, playerColorRecord, playerColorRecordF, playerColors } from "@thegraid/hexlib";

declare type Params = { [x: string]: any; }
export class TP extends TPLib {

  static override useEwTopo = true;
  static parallelAttack = true;  // true --> N intersects S
  static allowSacrifice = true;
  static yield = true     // Planner should yield when dmc > yieldMs [from before Worker?]
  static yieldMM = 1
  static pPlaner = false; // Planners run in parallel
  static pWorker = false
  static pWeight = 1      // allocation of new value: vNew * w + vOld * (1-w)
  static keepMoves = 4;   // number of predicted/evaluated moves to retain in State.moveAry
  static pResign = 1      // if lookahead(resignAhead).bv = -Infinity --> Resign
  static pBoards = true   // true: evalState saves board->state
  static pMoves = true    // true: use predicted moveAry
  static pGCM = true      // GC state.moveAry (except bestHexState.moveAry)
  static override maxPlys = 5      // for robo-player lookahead
  static override maxBreadth = 7   // for robo-player lookahead
  static nPerDist = 4     // samples per district
  static BW = playerColorRecord('BLACK', 'WHITE')
  static RB = playerColorRecord('RED', 'BLUE')
  static schemeNames = ['BW', 'RB']
  static override colorScheme = TP.BW; // TODO: replace with Player.colorScheme[index]
  static override numPlayers = 2;
  /** Order [number of rings] of metaHexes */
  static override mHexes = 2    // number hexes on side of Meta-Hex
  /** Order [number of Hexs on side] of District [# rings of Hexes in each metaHex] */
  static override nHexes = 2    // number of Hexes on side of District
  static nDistricts = 7
  static nVictory = 4  // number of Districts to control
  static tHexes = TP.ftHexes(this.mHexes) * TP.ftHexes(this.nHexes)
  static nMinControl  = (TP.nHexes <= 1) ? 1 : TP.nHexes + 1 // [1, 1, 3, 4, 5, ...]
  static nDiffControl = (TP.nHexes <= 1) ? 0 : TP.nHexes - 1 // [0, 0, 1, 2, 3, ...]
  static override hexRad = 50
  static override log = 1
  /** set victory conditions for (nh, mh) */
  static fnHexes(mh: number, nh: number) {
    TP.mHexes = mh
    TP.nHexes = nh = (mh < 5 ? nh : 1)
    TP.nDistricts = TP.ftHexes(mh)
    TP.nVictory = Math.ceil(TP.nDistricts / 2)
    TP.tHexes = TP.ftHexes(mh) * TP.ftHexes(nh)
    TP.nMinControl  = (nh <= 1) ? 1 : nh + 1 // [1, 1, 3, 4, 5, ...]
    TP.nDiffControl = (nh <= 1) ? 1 : nh - 1 // [0, 0, 1, 2, 3, ...]
  }
  /** number of hexes in a metaHex of order n; number of districts(n=TP.mHexes)
   * @return an odd number: 1, 7, 19, 37, 61, 97, ... */
  static ftHexes(n: number): number { return (n <= 1) ? n : 6 * (n-1) + TP.ftHexes(n - 1) }
  /** initialize fnHexes using initial mH, nH */
  static xxx = TP.fnHexes(TP.mHexes, TP.nHexes)

  /** exclude whole Extension sets */
  static excludeExt: string[] = ["Policy", "Event", "Roads", "Transit"]; // url?ext=Transit,Roads
  // timeout: see also 'autoEvent'
  static override moveDwell:  number = 600
  static override flashDwell: number = 500
  static override flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static override bgColor: string = 'wheat'// C.BROWN
  static borderColor: string = 'peru'//TP.bgColor; //'burlywood'
  static override ghost: string = 'cgserver'   // game-setup.network()
  static override gdomain: string = 'thegraid.com'
  static override gport: number = 8447
  static override networkUrl = TP.buildURL();  // URL to cgserver (wspbserver)
  static override networkGroup: string = "hexagon";
}
