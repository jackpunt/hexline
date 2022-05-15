import { GamePlay, Move } from "./game-play";
import { StoneColor } from "./table-params";

/// <reference lib="webworker" />
//export type moveMessage = { color: StoneColor, history: Move[] }
// import { Planner } from './planner'
// const planner = new Planner(undefined, 0)
addEventListener('message', ({ data }) => {
  const response = `worker response to ${data}`;
  postMessage(response);
});
