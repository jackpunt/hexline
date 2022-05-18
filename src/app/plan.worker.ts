import { Planner } from './planner'
// importScripts ('MyWorker.js')
// https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers

export type PlanMsg = {
  verb: string,
  args: []
}


class WebWorker {
  constructor() {
    this.planner = new Planner(undefined, 0)
    self.addEventListener('message', ( msg: MessageEvent<PlanMsg> ) => {
      let {verb, args}  = msg.data
      const response = `plan.worker received: ${verb}: [${args}]`;
      postMessage(response);
    });
  }

  planner: Planner
  async start() {

  }
}
new WebWorker().start()
