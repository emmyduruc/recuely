import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ContractType, isValueOf } from '../src/index.ts';

// Loader for packages/contracts/fixtures (shared with apps/ai/tests/test_contracts.py).

export interface FixtureCase {
  name: string;
  value: unknown;
  /** Invalid cases: the path the first relevant issue must point at. */
  path?: string;
}

export interface ContractFixture {
  type: ContractType;
  valid: FixtureCase[];
  invalid: FixtureCase[];
}

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

export function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${relativePath}`, 'utf8')) as unknown;
}

function isCase(value: unknown): value is FixtureCase {
  return typeof value === 'object' && value !== null && 'name' in value && 'value' in value;
}

function toFixture(raw: unknown, file: string): ContractFixture {
  if (typeof raw !== 'object' || raw === null || !('type' in raw) || !('valid' in raw) || !('invalid' in raw)) {
    throw new Error(`${file}: not a contract fixture`);
  }
  const { type, valid, invalid } = raw;
  if (!isValueOf(ContractType, type) || !Array.isArray(valid) || !Array.isArray(invalid)) {
    throw new Error(`${file}: bad type or case lists`);
  }
  if (!valid.every(isCase) || !invalid.every(isCase)) {
    throw new Error(`${file}: every case needs a name and a value`);
  }
  return { type, valid, invalid };
}

export function loadContractFixtures(): ContractFixture[] {
  return readdirSync(`${FIXTURES_DIR}contracts`)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => toFixture(readJson(`contracts/${file}`), file));
}
