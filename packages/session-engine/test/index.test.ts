import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('session-engine', () => {
  it('T0: package entry point loads', () => {
    expect(PACKAGE_NAME).toBe('@repo/session-engine');
  });
});
