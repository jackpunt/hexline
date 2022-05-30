/**
https://stackoverflow.com/questions/71963376/how-to-enable-javascript-eventloop-when-running-nested-recursive-computation/71963377#71963377
 */ 

export function runEventLoop() {
  return new Promise((ok,fail) => setTimeout(ok,0));
}

/** <yield: void, return: TReturn, yield-in: unknown> */
//                            Generator<yield, return, yield-in>
export type YieldR<TReturn> = Generator<void, TReturn, unknown>
/**
 * Top-level function to give control to JS Event Loop, and then restart the stack of suspended functions.
 * 'genR' will restart the first/outermost suspended block, which will have code like *yieldR()
 * that loops to retry/restart the next/inner suspended function.
 * @param genR 
 * @param done 
 */
export function allowEventLoop<T>(genR: YieldR<T>, done?: (result: T) => void): void  {
  let result = (pauseMs == 0) ? genR.next() : { done: false, value: undefined }
  if (result.done) done && done(result.value)
  else setTimeout(() => allowEventLoop(genR, done), pauseMs)
}
 var pauseMs = 0
export function pauseGenR (ms: number = 1000) { pauseMs = ms }
export function resumeGenR (ms: number = 0) { pauseMs = ms }
/** 
 * Return next result from genR. 
 * If genR returns an actual value, return that value
 * If genR yields<void> then propagate a 'yield' to each yieldR0 up to allowEventLoop(); 
 * 
 * This shows the canonical form of the code.
 * It's not useful to actually *call* this code since it also returns a Generator,
 * and the calling code must then write a while !gen.next().done loop to handle the yield-vs-return!
 */
export function* yieldR<T extends object> (genR: YieldR<T>): YieldR<T> {
  let result: IteratorResult<void, T>
  while (result = genR.next(), !result.done) yield
  return result.value
}
type FUNC<T> = ()=>T
export const callQueue: Array<FUNC<any>> = []
export function callLater(fun: FUNC<any>) {
  callQueue.push(fun)
}
export function callTopLevel<T>(start: FUNC<T>, done?: (value: T) => void, threshold = 30, ms0 = Date.now()) {
  var dms: number
  while ((dms = Date.now() - ms0) < threshold) {
    let value = start()    // which may invoke callLater() to enqueue more tasks
    if (callQueue.length == 0) return done && done(value)
  }
  setTimeout(() => callTopLevel(callQueue.shift(), done, threshold))
}
  /*
  https://stackoverflow.com/questions/2282140/whats-the-yield-keyword-in-javascript
  function loop(generator, data) {
    result = generator.next(data);
    if (!result.done) {
      result.value(function(err, data) {
          if(err) generator.throw(err); // continue next iteration of generator with an exception
          else loop(generator, data);  // continue next iteration of generator normally
      });
    }
  }
  function* genSome() {
    var result = yield loadFromDB('query')
  }
  loop(genSome())

  https://stackoverflow.com/questions/71168892/how-to-initiate-programatically-a-user-performed-switch-to-debugging-mode-in-c
  setTimeout(function run () {
    generator.next();
    setTimeout(run);
  });
  */

/** Hexagonal canonical directions */
export enum Dir { C, NE, E, SE, SW, W, NW }
export type HexDir = 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N'
export type InfDir = Exclude<HexDir, 'N' | 'S'>        // 
export type HexAxis = Exclude<InfDir, 'SW' | 'W' | 'NW'>
export type XYWH = {x: number, y: number, w: number, h: number} // like a Rectangle
export type EwDir = Exclude<HexDir, 'N' | 'S'>
export type NsDir = Exclude<HexDir, 'E' | 'W'>

/** String things */
export namespace H {
  export const sqrt3 = Math.sqrt(3)  // 1.7320508075688772
  export const N: HexDir = "N"
  export const S: HexDir = "S"
  export const E: HexDir = "E"
  export const W: HexDir = "W"
  export const NE: HexDir = "NE"
  export const SE: HexDir = "SE"
  export const SW: HexDir = "SW"
  export const NW: HexDir = "NW"

  export const axis: HexAxis[] = [NE, E, SE];           // minimal reference directions
  export const dirs: HexDir[] = [NE, E, SE, SW, W, NW]; // standard direction signifiers () ClockWise
  export const ewdirs: HexDir[] = [NE, E, SE, SW, W, NW]; // directions for EwTOPO
  export const nsDirs: HexDir[] = [N, NE, SE, S, SW, NW]; // directions for NsTOPO
  export const infDirs: InfDir[] = dirs as InfDir[]     // until we extract from typeof InfDir
  export const dirRot: {[key in HexDir] : number} = { N: 0, E: 90, S: 180, W: 270, NE: 30, SE: 150, SW: 210, NW: 330 }
  export const dirRev: {[key in HexDir] : HexDir} = { N: S, S: N, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }
  export const dirRevEW: {[key in EwDir] : EwDir} = { E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }
  export const dirRevNS: {[key in NsDir] : NsDir} = { N: S, S: N, NE: SW, SE: NW, SW: NE, NW: SE }
  export const dnToAxis: { [key in InfDir]: HexAxis } = { NW: 'SE', W: 'E', SW: 'NE', NE: 'NE', E: 'E', SE: 'SE' }

  export const capColor1:   string = "rgba(150,  0,   0, .8)"
  export const capColor2:   string = "rgba(128,  80,  80, .8)"
  export const suiColor1:   string = "rgba(228,  228, 0, .8)"
}
