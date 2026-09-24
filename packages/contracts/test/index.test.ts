import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../src/index.ts';

describe('contracts', () => {
  it('T0: exposes the contract version', () => {
    expect(CONTRACT_VERSION).toBe('0.1.0');
  });
});
