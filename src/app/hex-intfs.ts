import { stime } from "@thegraid/createjs-lib"
import { EventDispatcher } from "createjs-module"

/** <yield: void, return: TReturn, yield-in: unknown> */
//                            Generator<yield, return, yield-in>
export type YieldR<TReturn> = Generator<void, TReturn, unknown>
export function allowEventLoop<T>(genR: YieldR<T>, done?: (result: T) => void): void  {
  console.log(stime('allowEventLoop', ` ENTER ->`), genR)
  let result = genR.next()
  console.log(stime('allowEventLoop', `result =`), result)
  if (result.done) done && done(result.value)
  else {
    console.log(stime('allowEventLoop', 'setTimeout ->'), genR)
    setTimeout(() => allowEventLoop(genR, done))
  }
}
/** 
 * Return next result from genR. 
 * If genR returns an actual value, return that value
 * If genR yields<void> then propagate a 'yield' to each yieldR0 up to allowEventLoop(); 
 */
export function* yieldR<T extends object> (genR: YieldR<T>) {
  let result = genR.next()
  console.log(stime('yieldR', ` result=`), result, genR)
  if (result.done) return result.value
  console.log(stime('yieldR', ` yield`))
  yield
  console.log(stime('yieldR', ` resume`))
  return yieldR(genR) // tail-recurse until returns result.value
}
/** wrapper to yieldR0: maybe yield, then return genR.next()  */
export function* yieldRx<T extends object> (genR: YieldR<T>, force = false)  {
  if (force) yield
  return yieldR(genR).next()
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
/** Interface into RoboPlayer */
export interface Notifyable {
  notify(source: EventDispatcher, eventName: string, dwell?: number): void
  block(source?: EventDispatcher, eventName?: string, dwell?: number): void
  bonusAry(card): number[]
}
/** Hexagonal canonical directions */
export enum Dir { C, NE, E, SE, SW, W, NW }
export type HexDir = 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N'
export type HexAxis = Exclude<HexDir, 'S' | 'SW' | 'W' | 'NW' | 'N'>
export type InfDir = Exclude<HexDir, 'N' | 'S'>        // 

/** String things */
export namespace H {
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
  export const infDirs: InfDir[] = dirs as InfDir[]     // until we extract from typeof InfDir
  export const dirRot: {[key in HexDir] : number} = { N: 0, E: 90, S: 180, W: 270, NE: 30, SE: 150, SW: 210, NW: 330 }
  export const dirRev: {[key in HexDir] : InfDir} = { N: E, S: E, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }

}
