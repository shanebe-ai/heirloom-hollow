// Types for shared/schedules.js.
export interface Stop { from: string; at: string; doing?: string; rest?: boolean; route?: string[] }
export interface Where { at: string; doing: string; scene: 'town' | 'farm' | 'ranch' | 'home'; route?: string[] }
export declare const POST_ROUND: string[];
export declare const SCHEDULES: Record<string, { home: string; stops: Stop[] }>;
export declare const PEOPLE: string[];
export declare const FARM_STROLLERS: string[];
export declare const FARM_WINDOWS: [string, string][];
export declare function farmVisits(day: number, season?: number, year?: number): { who: string; from: number; to: number; at: string }[];
export declare function whereIs(who: string, minutes: number, day: number, season?: number, year?: number): Where | null;
export declare function homeOf(who: string): string;
export declare function homeScene(who: string): 'farm' | 'town' | 'ranch';
export declare const SCENE_ORDER: ('farm' | 'town' | 'ranch')[];
