import type { TagObject } from './types';

/** The tag registry (SPEC.md §B5.1). Every operation has exactly one of these. */
export const ApiTag = {
  Health: 'Health',
  User: 'User',
  Settings: 'Settings',
  Voices: 'Voices',
  Devices: 'Devices',
  Projects: 'Projects',
  Scripts: 'Scripts',
  ChunkPlans: 'Chunk Plans',
  Sessions: 'Sessions',
  Takes: 'Takes',
  Exports: 'Exports',
} as const;
export type ApiTag = (typeof ApiTag)[keyof typeof ApiTag];

const TAG_DESCRIPTION: Record<ApiTag, string> = {
  [ApiTag.Health]: 'Liveness and dependency status (database, AI service).',
  [ApiTag.User]: 'The current (local) user profile.',
  [ApiTag.Settings]: 'Per-user preferences: voice, speed, thresholds, theme, command aliases.',
  [ApiTag.Voices]: 'Favorite voices.',
  [ApiTag.Devices]: 'Per-device calibration and capability results.',
  [ApiTag.Projects]: 'Projects owning scripts and sessions.',
  [ApiTag.Scripts]: 'Versioned scripts and blocks.',
  [ApiTag.ChunkPlans]: 'Chunk boundaries over spoken text.',
  [ApiTag.Sessions]: 'Recording session snapshots.',
  [ApiTag.Takes]: 'Recorded takes: upload, select, soft delete.',
  [ApiTag.Exports]: 'Per-take and stitched exports.',
};

export const TAGS: readonly TagObject[] = Object.values(ApiTag).map((name) => ({
  name,
  description: TAG_DESCRIPTION[name],
}));
