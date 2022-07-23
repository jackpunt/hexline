export const stoneColors = ['b', 'w'] as const
export const stoneColor0 = stoneColors[0]
export const stoneColor1 = stoneColors[1]
//type stoneColorTuple = typeof stoneColors
export type StoneColor = typeof stoneColors[number]
export function otherColor(color: StoneColor): StoneColor { return color === stoneColor0 ? stoneColor1 : stoneColor0 }

export type StoneColorRecord<T> = Record<StoneColor, T>
export function stoneColorRecord<T>(b: T = undefined, w: T = undefined): StoneColorRecord<T> { return { 'b': b, 'w': w } };
export function stoneColorRecordF<T>(f: (sc: StoneColor) => T) { return stoneColorRecord(f(stoneColor0), f(stoneColor1)) }

export function buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
  return `${scheme}://${host}.${domain}:${port}${path}`
}
export class TP {
  static allowSacrifice = true;
  static yield = true
  static yieldMM = 1
  static pPlaner = true
  static pWorker = false
  static pWeight = 1
  static keepMoves = 4;   // number of predicted/evaluated moves to retain in State.moveAry
  static pResign = 1      // if lookahead(resignAhead).bv = -Infinity --> Resign
  static pBoards = true   // true: evalState saves board->state
  static pMoves = true    // true: use predicted moveAry
  static pGCM = true      // GC state.moveAry (except bestHexState.moveAry)
  static maxPlys = 5      // for robo-player lookahead
  static maxBreadth = 7   // for robo-player lookahead
  static nPerDist = 4     // samples per district
  static Black_White = stoneColorRecord('BLACK', 'WHITE')
  static Blue_Red = stoneColorRecord('BLUE', 'RED')
  static schemeNames = ['Black_White', 'Blue_Red']
  static colorScheme = TP.Black_White
  static numPlayers = 2;
  /** Order [number of rings] of metaHexes */
  static mHexes = 3    // number hexes on side of Meta-Hex
  /** Order [number of Hexs on side] of District [# rings of Hexes in each metaHex] */
  static nHexes = 2    // number of Hexes on side of District
  static nDistricts = 7
  static nVictory = 4  // number of Districts to control
  static tHexes = TP.ftHexes(this.mHexes) * TP.ftHexes(this.nHexes)
  static nMinControl  = (TP.nHexes <= 1) ? 1 : TP.nHexes + 1 // [1, 1, 3, 4, 5, ...]
  static nDiffControl = (TP.nHexes <= 1) ? 0 : TP.nHexes - 1 // [0, 0, 1, 2, 3, ...]
  static hexRad = 50
  static log = 0
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
  static moveDwell:  number = 600
  static flashDwell: number = 500
  static flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static bgColor: string = 'wheat'// C.BROWN
  static borderColor: string = 'peru'//TP.bgColor; //'burlywood'
  static ghost: string = 'game7'   // game-setup.network()
  static gdomain: string = 'thegraid.com'
  static gport: number = 8447
  static networkUrl = buildURL();  // URL to cgserver (wspbserver)
  static networkGroup: string = "hexline:game1";
}