import type { StationId } from './labModel';

export type Vec3 = readonly [number, number, number];

/** Room 02 uses metres throughout. Keep layout values here so geometry,
 * collision, and future custom assets share one source of truth. */
export const ROOM2_CONFIG = {
  units: 'metres',
  room: {
    width: 21.6,
    depth: 14.8,
    height: 4.2,
    wallThickness: 0.32,
    floorY: 0,
    backZ: -7.4,
    sideX: 10.8,
  },
  table: {
    width: 3.4,
    depth: 1.76,
    topHeight: 0.88,
    thickness: 0.10,
    legHeight: 0.88,
  },
  stations: {
    wave: { x: 0, color: 0x22d3ee },
    sound: { x: -6.0, color: 0xa78bfa },
    electro: { x: 6.0, color: 0xfb923c },
  } satisfies Record<StationId, { x: number; color: number }>,
  door: {
    x: 8.65,
    y: 1.70,
    z: -7.38,
    width: 2.80,
    height: 3.40,
    thickness: 0.30,
    hinge: 'left' as const,
  },
} as const;

export const ROOM2_COLLISION = {
  playerRadius: 0.34,
  walkableHalfWidth: ROOM2_CONFIG.room.sideX - 1.10,
  walkableFrontZ: ROOM2_CONFIG.room.depth / 2 - 1.25,
  walkableBackZ: ROOM2_CONFIG.room.backZ + 1.15,
} as const;

