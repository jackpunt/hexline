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
