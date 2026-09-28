import { Arrangement, CommandSource, Intent, SessionState } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { type EngineEvent, EventType, isCommandAllowed, step } from '../src/index.ts';
import { cmd, driveTo } from './helpers.ts';

// SPEC.md §B6 permission matrix, copied verbatim (✓ accepted · ✗ ignored · T touch/keyboard only · ✓* isolated
// voice). Every cell is checked twice: against the matrix lookup, and end-to-end through the engine.
const SPEC_TABLE = `
| Intent \\ State        | ready | speaking (A1) | speaking (A2) | settle | waiting | creator_speaking | evaluating | review | paused |
| START/CONTINUE         | ✓ | ✗ | ✗ | ✗ | ✗ | ✗  | ✗ | ✓ | ✓ |
| PAUSE                  | ✓ | T | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ | ✗ |
| REPEAT                 | ✓ | T | ✓ | ✓ | ✓ | ✗  | ✗ | ✓ | ✓ |
| RETAKE                 | ✓ | ✗ | ✗ | ✗ | ✓ | ✗  | ✗ | ✓ | ✓ |
| NEXT/PREVIOUS          | ✓ | T | T | T | ✓ | ✗  | ✗ | ✓ | ✓ |
| SPEED/CHUNK_SIZE/HELP  | ✓ | T | ✓ | ✓ | ✓ | ✗  | ✓ | ✓ | ✓ |
`;

const COLUMNS: { name: string; state: SessionState; arrangement: Arrangement }[] = [
  { name: 'ready', state: SessionState.Ready, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'speaking (A1)', state: SessionState.AssistantSpeaking, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'speaking (A2)', state: SessionState.AssistantSpeaking, arrangement: Arrangement.OneDeviceHeadset },
  { name: 'settle', state: SessionState.Settle, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'waiting', state: SessionState.WaitingForSpeech, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'creator_speaking', state: SessionState.CreatorSpeaking, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'evaluating', state: SessionState.Evaluating, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'review', state: SessionState.ReviewOrAdvance, arrangement: Arrangement.OneDeviceSpeaker },
  { name: 'paused', state: SessionState.Paused, arrangement: Arrangement.OneDeviceSpeaker },
];

const ROWS: Record<string, readonly Intent[]> = {
  'START/CONTINUE': [Intent.Start, Intent.Continue],
  PAUSE: [Intent.Pause],
  REPEAT: [Intent.Repeat],
  RETAKE: [Intent.Retake],
  'NEXT/PREVIOUS': [Intent.Next, Intent.Previous, Intent.Navigate],
  'SPEED/CHUNK_SIZE/HELP': [Intent.Speed, Intent.ChunkSize, Intent.Help],
};

/** Valid arguments so that an accepted command always does something. */
const ARGS: Partial<Record<Intent, Record<string, string>>> = {
  [Intent.Navigate]: { chunkId: 'c3' },
  [Intent.Speed]: { speed: 'faster' },
  [Intent.ChunkSize]: { mode: 'short' },
};

const Cell = { Yes: '✓', No: '✗', Touch: 'T', Isolated: '✓*' } as const;
type Cell = (typeof Cell)[keyof typeof Cell];

const EXPECT_VOICE: Record<Cell, boolean> = { [Cell.Yes]: true, [Cell.No]: false, [Cell.Touch]: false, [Cell.Isolated]: false };
const EXPECT_TOUCH: Record<Cell, boolean> = { [Cell.Yes]: true, [Cell.No]: false, [Cell.Touch]: true, [Cell.Isolated]: true };

function isCell(value: string): value is Cell {
  return Object.values(Cell).some((cell) => cell === value);
}

const table = SPEC_TABLE.trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split('|').map((part) => part.trim()).filter((part) => part.length > 0));

const OUTSIDE = [SessionState.Idle, SessionState.Preparing, SessionState.Recovering, SessionState.Error, SessionState.Completed];

describe('§B6 permission matrix', () => {
  it('T5: the copied table has 6 rows × 9 columns', () => {
    expect(table).toHaveLength(6);
    expect(table.every((row) => row.length === 10)).toBe(true);
  });

  for (const [rowName, ...cells] of table) {
    const intents = ROWS[rowName ?? ''] ?? [];
    cells.forEach((raw, index) => {
      const column = COLUMNS[index];
      if (column === undefined || !isCell(raw)) {
        throw new Error(`bad cell "${raw}" in row ${String(rowName)}`);
      }
      for (const intent of intents) {
        for (const source of [CommandSource.Voice, CommandSource.Touch, CommandSource.Keyboard]) {
          const expected = (source === CommandSource.Voice ? EXPECT_VOICE : EXPECT_TOUCH)[raw];
          it(`B6-M: ${intent} in ${column.name} by ${source} → ${expected ? 'accepted' : 'ignored'} (cell ${raw})`, () => {
            const event = cmd(intent, source, ARGS[intent]);
            if (event.type !== EventType.Command) {
              throw new Error('not a command');
            }
            expect(isCommandAllowed(column.state, column.arrangement, event.command)).toBe(expected);
            const before = driveTo(column.state, { arrangement: column.arrangement });
            // Well after driveTo's own taps, so tap coalescing (300 ms) doesn't apply.
            const after = step(before, event, 60_000);
            expect(after.snapshot !== before, JSON.stringify(after.effects)).toBe(expected);
          });
        }
      }
    });
  }

  it('T5: ✓* cells accept a voice command that passes the isolated-utterance gate', () => {
    const speaking = driveTo(SessionState.CreatorSpeaking);
    const event = { ...cmd(Intent.Pause, CommandSource.Voice), speechGate: { durationMs: 800, exactGrammarMatch: true, chunkSimilarity: 0.1 } } as EngineEvent;
    expect(step(speaking, event, 0).snapshot.state).toBe(SessionState.Paused);
  });

  for (const state of OUTSIDE) {
    it(`B6-M: ${state} is outside the matrix and ignores every command`, () => {
      const before = driveTo(state);
      for (const intent of Object.values(Intent)) {
        for (const source of [CommandSource.Voice, CommandSource.Touch]) {
          expect(step(before, cmd(intent, source, ARGS[intent]), 0).snapshot, `${intent}/${source}`).toBe(before);
        }
      }
    });
  }
});
