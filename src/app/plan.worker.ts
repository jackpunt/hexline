var window = self

import { Planner } from './planner'
class WebWorker {
  async start() {
    let planner;
    planner = new Planner(undefined, 0)
    return planner
  }
}

addEventListener('message', ({ data }) => {
  const response = `plan.worker recieved: ${data}`;
  postMessage(response);
});