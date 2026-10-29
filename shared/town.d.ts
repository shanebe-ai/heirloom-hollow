// Types for shared/town.js.
import type { Save } from './rules.js';

export interface Building {
  id: string; name: string; keepers: string[]; x: number; y: number; w: number; h: number; row: 'north' | 'south';
  hours?: [string, string]; rest?: boolean; home?: boolean; roof: string; wall: string;
  door: { x: number; y: number }; front: { x: number; y: number };
}
export type TownGround = 'grass' | 'path' | 'cobble' | 'water' | 'bridge' | 'dock';
export interface Spot { scene: 'town' | 'farm'; x: number; y: number }
export interface Result { ok: boolean; msg: string }

export declare const TOWN_COLS: number;
export declare const TOWN_ROWS: number;
export declare const NORTH_ROAD: number;
export declare const SOUTH_ROAD: number;
export declare const ENTRY_ROW: number;
export declare const RIVER_ROWS: number[];
export declare const BRIDGE_COLS: number[];
export declare const SQUARE: { x: number; y: number; w: number; h: number };
export declare const FOUNTAIN: { x: number; y: number; w: number; h: number };
export declare const NOTICEBOARD: { x: number; y: number };
export declare const WEST_GATE: { x: number; y: number };
export declare const EAST_GATE: { x: number; y: number };
export declare const BUILDINGS: Building[];
export declare const BUILDING: Record<string, Building>;
export declare const SPOTS: Record<string, Spot>;
export declare const STORE_GOODS: { id: string; name: string; price: number; about: string }[];
export declare const FOOD: Record<string, { name: string; price: number; energy: number; place: string; daily: boolean }>;
export declare function isRestDay(day: number): boolean;
export declare function isOpen(id: string, minutes: number, day: number): boolean;
export declare function hoursText(id: string): string;
export declare function townLayout(): {
  ground: TownGround[][]; blocked: boolean[][]; trees: { x: number; y: number }[];
  beds: { x: number; y: number }[]; lamps: { x: number; y: number }[]; benches: { x: number; y: number }[];
  bonsai: { x: number; y: number; w: number };
};
export declare function dayStamp(save: Save): string;
export declare function hadToday(save: Save, food: string): boolean;
export declare function eat(save: Save, food: string): Result;
export declare function buyAtStore(save: Save, id: string): Result;
export declare function canCapacity(save: Save): number;
