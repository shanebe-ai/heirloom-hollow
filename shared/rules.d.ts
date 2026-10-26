// Types for shared/rules.js, so the TypeScript client gets the same rules the tests check.

export interface Tile {
  tilled: boolean;
  crop?: string;
  age?: number;
  watered?: boolean;
  dead?: boolean;
}

export interface Save {
  version: 1;
  day: number;
  season: 0 | 1 | 2 | 3;
  year: number;
  minutes: number;
  coins: number;
  energy: number;
  can: number;
  inventory: Record<string, number>;
  shipping: Record<string, number>;
  tiles: Record<string, Tile>;
  player: { x: number; y: number; scene: 'farm' | 'house' };
  chatMemory?: Record<string, { from: string; text: string }[]>;
}

export interface CropDef {
  name: string;
  plural: string;
  seed: string;
  seedCost: number;
  days: number;
  sell: number;
  regrow: number;
  seasons: number[];
}

export interface ItemDef {
  name: string;
  plural: string;
  sell?: number;
  buy?: number;
  crop?: string;
}

export declare const SEASONS: string[];
export declare const DAYS_PER_SEASON: number;
export declare const DAY_START: number;
export declare const DAY_END: number;
export declare const MAX_ENERGY: number;
export declare const TIRED_BELOW: number;
export declare const CAN_CAPACITY: number;
export declare const START_COINS: number;
export declare const PASS_OUT_CAP: number;
export declare const ENERGY_COSTS: Record<'hoe' | 'water' | 'plant' | 'harvest', number>;
export declare const CROPS: Record<string, CropDef>;
export declare const ITEMS: Record<string, ItemDef>;

export declare function newSave(): Save;
export declare function cropStage(tile: Tile | undefined): number;
export declare function isRipe(tile: Tile | undefined): boolean;
export declare function harvestTile(save: Save, key: string): string | null;
export declare function passOutPenalty(coins: number): number;
export declare function advanceNight(save: Save): { lines: string[]; payout: number; seasonChanged: boolean };
