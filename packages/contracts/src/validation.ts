import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { type TextSpan, TimingSource, type TtsResult, type WordTiming } from './payloads.ts';
import { TakeKind } from './recording.ts';
import {
  type ContractType,
  type ContractTypes,
  DATE_TIME_PATTERN,
  EMAIL_PATTERN,
  SCHEMAS,
  UUID_PATTERN,
} from './schemas/index.ts';

// Schema validation plus the few cross-field rules JSON Schema can't express. The Python mirrors in
// apps/ai/app/contracts.py enforce the same rules; the shared fixtures prove both agree (SPEC.md Task 2).

export interface ContractIssue {
  /** Dotted path, e.g. `commandAliases.NEXT[0]`; `(root)` for the value itself. */
  path: string;
  issue: string;
}

export type ContractResult<T> = { ok: true; value: T } | { ok: false; issues: ContractIssue[] };

const ROOT = '(root)';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  formats: {
    uuid: new RegExp(UUID_PATTERN),
    'date-time': new RegExp(DATE_TIME_PATTERN),
    email: new RegExp(EMAIL_PATTERN),
  },
});
for (const schema of Object.values(SCHEMAS)) {
  ajv.addSchema(schema);
}

const validators = new Map<ContractType, ValidateFunction>();

function validatorFor(type: ContractType): ValidateFunction {
  let validate = validators.get(type);
  if (validate === undefined) {
    validate = ajv.getSchema(`${type}.json`);
    if (validate === undefined) {
      throw new Error(`No schema registered for ${type}`);
    }
    validators.set(type, validate);
  }
  return validate;
}

/** `/commandAliases/NEXT/0` → `commandAliases.NEXT[0]`. */
function toPath(pointer: string, child?: string): string {
  const segments = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (child !== undefined) {
    segments.push(child);
  }
  const path = segments.reduce(
    (acc, segment) => (/^\d+$/.test(segment) ? `${acc}[${segment}]` : [acc, segment].filter(Boolean).join('.')),
    '',
  );
  return path.length === 0 ? ROOT : path;
}

function param(error: ErrorObject, name: string): unknown {
  const params: Record<string, unknown> = error.params;
  return params[name];
}

/** Returns null for errors that only echo another one (ajv's `propertyNames` wrapper). */
type IssueFormatter = (error: ErrorObject) => ContractIssue | null;

function allowedList(error: ErrorObject): string {
  const allowed = param(error, 'allowedValues');
  return Array.isArray(allowed) ? allowed.map(String).join(', ') : '';
}

/** Readable messages for the keywords our schemas use; anything else falls back to ajv's message. */
const FORMAT: Partial<Record<string, IssueFormatter>> = {
  additionalProperties: (e) => ({ path: toPath(e.instancePath, String(param(e, 'additionalProperty'))), issue: 'unknown field' }),
  required: (e) => ({ path: toPath(e.instancePath, String(param(e, 'missingProperty'))), issue: 'is required' }),
  minProperties: (e) => ({ path: toPath(e.instancePath), issue: 'must contain at least one field' }),
  // Inside `propertyNames`, ajv reports the enum failure on the parent and names the key in `propertyName`.
  enum: (e) =>
    e.propertyName === undefined
      ? { path: toPath(e.instancePath), issue: `must be one of: ${allowedList(e)}` }
      : { path: toPath(e.instancePath, e.propertyName), issue: `unknown key; use one of: ${allowedList(e)}` },
  propertyNames: () => null,
  pattern: (e) => ({ path: toPath(e.instancePath), issue: 'has an invalid format or is blank' }),
  maximum: (e) => ({ path: toPath(e.instancePath), issue: `must be at most ${String(param(e, 'limit'))}` }),
  minimum: (e) => ({ path: toPath(e.instancePath), issue: `must be at least ${String(param(e, 'limit'))}` }),
};

function toIssue(error: ErrorObject): ContractIssue | null {
  const format = FORMAT[error.keyword];
  return format === undefined ? { path: toPath(error.instancePath), issue: error.message ?? 'is invalid' } : format(error);
}

function isIssue(issue: ContractIssue | null): issue is ContractIssue {
  return issue !== null;
}

/** Drops ajv's follow-up errors (`if`/`propertyNames` echoes) and duplicates. */
function dedupe(issues: ContractIssue[]): ContractIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.issue}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function spanIssues(span: TextSpan, path: string): ContractIssue[] {
  return span.charEnd < span.charStart ? [{ path: `${path}.charEnd`, issue: 'must be ≥ charStart' }] : [];
}

function wordTimingIssues(timing: WordTiming, path: string): ContractIssue[] {
  const timeIssues = timing.end < timing.start ? [{ path: `${path}.end`, issue: 'must be ≥ start' }] : [];
  return [...timeIssues, ...spanIssues(timing, path)];
}

type Refinement<T> = (value: T) => ContractIssue[];

const MEDIA_PREFIX: Record<TakeKind, string> = {
  [TakeKind.Audio]: 'audio/',
  [TakeKind.Video]: 'video/',
};

function mediaKindIssues(take: { kind: TakeKind; mimeType: string }): ContractIssue[] {
  return take.mimeType.startsWith(MEDIA_PREFIX[take.kind])
    ? []
    : [{ path: 'mimeType', issue: `must be a ${take.kind} type for a ${take.kind} take` }];
}

const REFINE: { [K in ContractType]?: Refinement<ContractTypes[K]> } = {
  WordTiming: (timing) => wordTimingIssues(timing, ROOT),
  TextSpan: (span) => spanIssues(span, ROOT),
  TtsResult: (result: TtsResult) => {
    const noTimings = result.timings === null;
    const issues: ContractIssue[] =
      noTimings === (result.timingSource === TimingSource.None)
        ? []
        : [{ path: 'timings', issue: 'must be null exactly when timingSource is none' }];
    (result.timings ?? []).forEach((timing, index) => {
      issues.push(...wordTimingIssues(timing, `timings[${String(index)}]`));
    });
    return issues;
  },
  MatchResult: (result) => result.missingSpans.flatMap((span, index) => spanIssues(span, `missingSpans[${String(index)}]`)),
  CreateTakeRequest: mediaKindIssues,
  Take: mediaKindIssues,
};

function refine<K extends ContractType>(type: K, value: ContractTypes[K]): ContractIssue[] {
  const refinement: Refinement<ContractTypes[K]> | undefined = REFINE[type];
  return refinement === undefined ? [] : refinement(value);
}

/** Validates `value` against a contract. On success `value` is typed; on failure every problem is listed. */
export function validateContract<K extends ContractType>(type: K, value: unknown): ContractResult<ContractTypes[K]> {
  const validate = validatorFor(type);
  if (!validate(value)) {
    return { ok: false, issues: dedupe((validate.errors ?? []).map(toIssue).filter(isIssue)) };
  }
  const typed = value as ContractTypes[K];
  const issues = refine(type, typed);
  return issues.length === 0 ? { ok: true, value: typed } : { ok: false, issues };
}
