import { TP as TPLib  } from "@thegraid/hexlib";

const playerColorsLib = ['b', 'w'] as const // Player Colors!
export const playerColors = playerColorsLib.concat();
/** Default type for PlayerColor. Maybe don't import, define your own locally.
 *
 * @example
 * import { playerColors, PlayerColor as PCLib } from "@thegraid/hexlib"
 * playerColors.push('c')
 * type PlayerColor = PCLib | 'c' // Player Colors + Criminal!
 */
export type PlayerColor = typeof playerColorsLib[number];
// Locally (for example, hextowns):

export const playerColor0 = playerColors[0]
export const playerColor1 = playerColors[1]
// export const playerColor2 = playerColorsC[2]
export function otherColor(color: PlayerColor): PlayerColor { return color === playerColor0 ? playerColor1 : playerColor0 }

export type PlayerColorRecord<T> = Record<PlayerColor, T>
/** @return \{ pc0: arg0 as T, pc1: arg1 as T, ...}: PlayerColorRecord\<T> */
export function playerColorRecord<T>(...args: T[]) {
  const rv = {} as PlayerColorRecord<T>
  playerColors.forEach((key, ndx) => rv[key] = (args[ndx]))
  return rv;
}
export function playerColorRecordF<T>(f: (sc: PlayerColor) => T) {
  return playerColorRecord(...playerColors.map(pc => f(pc)))
}

export function buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
  return `${scheme}://${host}.${domain}:${port}${path}`
}
type Params = { [x: string]: any; }
export class TP extends TPLib {

  // try NOT setting anthing that is not in TPLib, nor any 'function'
  static override setParams(local: Params = {}, force = false, tplib = (TPLib as Params)) {
    /** do not muck with standard basic properties of all/empty classes */
    // reverse it: *only* copy the fields that are already in TPLib!
    const TP0 = TP, TPlib = TPLib; // inspectable in debugger
    const static_props = TP.staticFields(tplib);
    for (let [key, value] of Object.entries(local)) {
      if (tplib[key] === undefined) continue; // no collision leave in TP-local
      // t
      if (force || static_props.includes(key)) {
        if (!force && (typeof value === 'string' && typeof tplib[key] === 'number')) {
          value = Number.parseInt(value); // minimal effort to align types.
        }
        tplib[key] = value; // set a static value in base; DANGER! not typesafe!
        delete local[key];  // so future local[key] = value will tplib[key] = value;
      }
    }
  }
  static setParams2(qParams?: Params, add?: boolean): void {
    const TP0 = TP, TPlib = TPLib; // inspectable in debugger
    TPLib.setParams(qParams);
    TPLib.setParams(qParams, false, TP); // also set in local 'override' copy.
    console.log(`TP.setParams:`, { qParams, TP0, TPlib, ghost: TP.ghost, gport: TP.gport, networkURL: TP.networkUrl });
    return;
  }
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
  static Black_White = playerColorRecord('BLACK', 'WHITE')
  static Blue_Red = playerColorRecord('BLUE', 'RED')
  static schemeNames = ['Black_White', 'Blue_Red']
  static override colorScheme = TP.Black_White
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
