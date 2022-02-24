import { EventDispatcher } from "createjs-module"

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
  export const dirRot: {[key in HexDir] : number} = { N: 0, E: 90, S: 180, W: 270, NE: 30, SE: 150, SW: 210, NW: 330 }
  export const dirRev: {[key in HexDir] : InfDir} = { N: E, S: E, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }

}
