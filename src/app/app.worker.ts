import { GamePlay, Move } from "./game-play";
import { StoneColor } from "./table-params";

/// <reference lib="webworker" />
//export type moveMessage = { color: StoneColor, history: Move[] }
// import { Planner } from './planner'
// const planner = new Planner(undefined, 0)
addEventListener('message', ({ data }) => {
  const response = `app.worker recieved: ${data}`;
  postMessage(response);
});
// maybe something from https://www.jameslmilner.com/post/workers-with-webpack-and-typescript/