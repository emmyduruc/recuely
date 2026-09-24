export { reconcileBlockIds, retypeBlock } from './blocks.ts';
export { assertCoverage, checkCoverage, CoverageError, type CoverageIssue, CoverageIssueCode } from './coverage.ts';
export { parseScript, type ParseOptions, splitLines } from './parse.ts';
export {
  applyBoundaryProposals,
  type BlockPosition,
  isLegalCut,
  MAX_SNAP_DISTANCE,
  mergeWithNext,
  moveBoundary,
  type PlanOptions,
  ProposalRejection,
  type ProposalOutcome,
  rechunkFrom,
  segment,
  splitChunk,
} from './plan.ts';
export { type EditResult, type IdFactory, ScriptEditError } from './result.ts';
export { DEFAULT_TUNING, type SegmentationTuning, segmentText } from './segment.ts';
export { detectTables, spokenColumn } from './table.ts';
export {
  collapseWhitespace,
  countWords,
  isCutPosition,
  normalize,
  snapToCut,
  spokenTextOf,
  stripEmphasis,
} from './text.ts';
