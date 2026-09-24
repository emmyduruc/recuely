import { HealthStatus } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { buildAppHealth } from '../server/utils/health';

describe('app health', () => {
  it('T1: reports the app as ok together with the database status', () => {
    expect(buildAppHealth(HealthStatus.Unavailable)).toEqual({ app: HealthStatus.Ok, db: HealthStatus.Unavailable });
  });
});
