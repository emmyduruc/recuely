import { HealthStatus } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { buildAppHealth } from '../server/utils/health';

describe('app health', () => {
  it('T1/T10: reports the app as ok together with the database and speech status', () => {
    const speech = { openai: HealthStatus.Ok, local: HealthStatus.Unavailable };
    expect(buildAppHealth(HealthStatus.Unavailable, speech)).toEqual({ app: HealthStatus.Ok, db: HealthStatus.Unavailable, speech });
  });
});
