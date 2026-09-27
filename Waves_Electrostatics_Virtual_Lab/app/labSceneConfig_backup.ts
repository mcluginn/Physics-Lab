import type { StationId } from './labModel';

export type Vec3 = readonly [number, number, number];

/** Room 02 uses metres throughout. Keep layout values here so geometry,
 * collision, and future custom assets share one source of truth. */
export const ROOM2_CONFIG = {
  units: 'metres',
  room: {
    width: 22,
    depth: 15,
    height: 6.4,
    wallThickness: 0.28,
    floorY: 0,
    backZ: -7.5,
    sideX: 11,
  },
  table: {
    width: 4.4,
    depth: 2.3,
    topHeight: 1.2,
    thickness: 0.22,
    legHeight: 1.2,
  },
  stations: {
    wave: { x: 0, color: 0x22d3ee },
    sound: { x: -6.6, color: 0xa78bfa },
    electro: { x: 6.6, color: 0xfb923c },
  } satisfies Record<StationId, { x: number; color: number }>,
  door: {
    x: 8.65,
    y: 1.75,
    z: -7.32,
    width: 2.7,
    height: 3.5,
    thickness: 0.18,
    hinge: 'left' as const,
  },
} as const;

export const ROOM2_COLLISION = {
  playerRadius: 0.34,
  walkableHalfWidth: ROOM2_CONFIG.room.sideX - 0.2,
  walkableFrontZ: ROOM2_CONFIG.room.depth / 2 - 0.2,
  walkableBackZ: ROOM2_CONFIG.room.backZ + ROOM2_CONFIG.room.wallThickness + 0.55,
} as const;
