import { stime } from "@thegraid/createjs-lib"
import { EventDispatcher } from "createjs-module"

/**
We want to enable event processing during long-running, mutually recursive function calls.
(for example, a recursive tree search)
After a certain depth or time, the search wants to voluntarily suspend execution
to allow the top level Event Loop to run (handle mouse/key events, repaint graphics, etc)

The ideal would be a system-level function to runEventLoop()
which 'yield' the current computation, put its own continuation on the event queue,
and throw control to the system EventLoop.

It seems that Javascript provides only partial solutions for this:
'setTimeout()' will put a function on the event queue [but not the current continuation]
'yield' will suspend the current continuation, but not put it on the event queue.
But 'yield' returns a value to the Generator's caller one level up the call stack.
And that caller must already have the 'continuation' in form of the Generator.

We also note that although an uncaught 'throw' will return control to the top-level,
there is no way (TIKO) in JS to recover & restart the 'thrown' computation.

(from top level through the mutually-recursive calls to the voluntary 'yield')
So: to return control from the voluntary yield, 
up through the nested or mutually-recursive functions, 
all the way to the system EventLoop, we do 3 things:
1: Each function [caller & called] must be declared as function* (so it can yield)
2: Each function [caller] must test whether its [called] descendant suspended, 
   and if so, yield itself to propagate the 'yield' to the top level:
   let result, genR = calledStarFunction(args);
   while (result = genR.next(), !result.done) yield;
   use (result.value)
Note: #2 cannot be wrapped in a function... because that function would be subject to #1
3: At the top-levl, use setTimeout(() => genR.next()) return to the JS EventLoop
   and then restart the chain of suspended functions.

Note: most documented usage of function* are to create a Generator, in a case where
'yield' provides the interesting/useful value, and 'return' simply indicates its done.
In this use-case its inverted: yield gives a signal, but no interesting value,
and 'return' supplies the interesting computational value.

Appeal to the JS Gods:
Provide a function: runEventLoop()
That transparently puts the current continuation (the full stack) on the event loop
and return control directly to the top-level. 
so all the other callers and the call stack 
do not need to be aware of the suspend/resume beind done at the lower level
 */ 
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
  console.log(stime('allowEventLoop', ` ENTER ->`), genR)
  let result = genR.next()
  console.log(stime('allowEventLoop', ` result =`), result)
  if (result.done) done && done(result.value)
  else {
    console.log(stime('allowEventLoop', ' setTimeout ->'), genR)
    setTimeout(() => allowEventLoop(genR, done))
  }
}
/** 
 * Return next result from genR. 
 * If genR returns an actual value, return that value
 * If genR yields<void> then propagate a 'yield' to each yieldR0 up to allowEventLoop(); 
 * 
 * This shows the canonical form of the code.
 * It's not useful to actually *call* this code since it also returns a Generator,
 * and the calling code must then write a while loop to handle the yield-vs-return!
 */
export function* yieldR<T extends object> (genR: YieldR<T>, log?:string) {
  let result: IteratorResult<void, T>
  while (result = genR.next(), !result.done) yield
  return result.value
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
