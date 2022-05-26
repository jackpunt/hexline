import { S, stime } from '@thegraid/common-lib';
import { IMove } from './move';
import { PlanData } from './plan-proxy';
import { Planner } from './planner'
import { StoneColor, TP } from './table-params';
// importScripts ('MyWorker.js')
// https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers
// type of Worker: https://github.com/Microsoft/TypeScript/issues/20595#issuecomment-763604612

type Args = PlanData['args']
/** RPC 'stub' to invoke methods on given Planner */
class PlanWorker {
  planner: Planner
  get ll0() { return TP.log > 0 }
  get ll1() { return TP.log > 1 }
  constructor() {}
  async init() {
    this['Aname'] = `PlanWorker-${self['A_Random']}@${stime(this, '.init')}`
    self.addEventListener('message', (msg: MessageEvent<PlanData>) => { this.handleMsg(msg)})
  }
  get color() { return this.planner?.myStoneColor || '?' }

  handleMsg(msg: MessageEvent<PlanData>) {
    let { verb, args } = msg.data
    this.ll1 && console.log(stime(this, `(${this.color}).handleMsg:`), msg.data) // [Object object]
    switch (verb) {
      case 'newPlanner':
      case 'roboMove':
      case 'makeMove':
      case 'log':
      case 'setParam':
      case 'terminate':
        let func = this[verb]
        if (typeof func == 'function') {
          //console.log(stime(this, `.handleMsg: invoke this[${verb}]`), func)
          func.call(this, ...args)
        } else {
          console.warn(stime(this, `handleMsg.failed: this[${verb}]`), func)
        }
        break;
      default:
        console.warn(stime(this, `.handleMsg.default: ${verb}`), args)
        //this.planner[verb](...args)
    }
  };
  /** send tuple of args */
  reply(verb: string, ...args: (string | number | boolean)[]) {
    postMessage({verb, args})
  }
  newPlanner(mh: number, nh: number, index: number) {
    TP.fnHexes(nh, mh)
    // this.planner.gamePlay.hexMap.mh
    this.ll0 && console.log(stime(this, `.newPlanner:`), {mh, nh, index}) // [Object object]
    this.planner = new Planner(mh, nh, index)
    this[S.Aname] = `PlanWorker@${stime(this, `.newPlanner(${index})`)}`
    this.reply('ready', this.color, this.planner.depth)
  }
  roboMove(run: boolean) {
    this.planner.roboMove(run)
  }
  makeMove(stoneColor: StoneColor, iHistory: IMove[]) {
    let movePromise = this.planner.makeMove(stoneColor, iHistory)
    movePromise.then(hex => this.reply('move', hex.row, hex.col, hex.Aname))
  }
  log(...args: Args)  {
    console.log(stime(this, `.handleMsg.log:`), ...args)
  }
  setParam(...args: [string, string, (string|number|boolean)]) {
    let [targetName, fieldName, value] = args
    /*this.ll0 &&*/ console.log(stime(this, `.setParam:`), args)
    if (targetName === 'TP') TP[fieldName] = value
  }
  terminate(...args: Args) {
    this.ll0 && console.log(stime(this, `.handleMsg.terminate:`), args)
  }
}
stime.anno = (obj) => {
  return ` ${A_PlanWorker.color}`
}
var A_Random = self['A_Random'] = Math.floor(Math.random()*100)
var A_PlanWorker = self['A_PlanWorker'] = new PlanWorker()
A_PlanWorker.init()

