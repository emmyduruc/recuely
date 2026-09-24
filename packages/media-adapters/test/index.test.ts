import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('media-adapters', () => {
  it('T0: package entry point loads', () => {
    expect(PACKAGE_NAME).toBe('@repo/media-adapters');
  });
});
