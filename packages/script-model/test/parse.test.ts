import { BlockType, type ScriptBlock } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/index.ts';
import { counter } from './helpers.ts';

function parse(source: string): ScriptBlock[] {
  return parseScript(source, { newId: counter('b') });
}

function typed(source: string): [string, string][] {
  return parse(source).map((block) => [block.type, block.text]);
}

describe('paste parser: block typing', () => {
  it('T3: markdown headings (1–6 #) are headings; the marker is kept in metadata', () => {
    const [block] = parse('### Scene three');
    expect(block).toMatchObject({ type: BlockType.Heading, text: 'Scene three', metadata: { marker: '### ' } });
    expect(typed('####### too deep')).toEqual([[BlockType.Spoken, '####### too deep']]);
  });

  it('T3: "Note:" lines are notes, case-insensitively', () => {
    expect(typed('Note: breathe\nNOTES : slow down')).toEqual([
      [BlockType.Note, 'breathe'],
      [BlockType.Note, 'slow down'],
    ]);
  });

  it('T3: whole-line [brackets] are scene cues; inline brackets stay spoken', () => {
    expect(typed('[Scene 2: show the product]\nSay [this] now.')).toEqual([
      [BlockType.SceneCue, 'Scene 2: show the product'],
      [BlockType.Spoken, 'Say [this] now.'],
    ]);
  });

  it('T3: consecutive lines form one paragraph; blank lines separate paragraphs; wording is verbatim', () => {
    expect(typed('First line\n  second line\n\n\nNext   paragraph ')).toEqual([
      [BlockType.Spoken, 'First line\n  second line'],
      [BlockType.Spoken, 'Next   paragraph'],
    ]);
  });

  it('T3: each bullet is its own spoken block without the marker', () => {
    expect(typed('- one\n* two\n• three\n*emphasis* stays')).toEqual([
      [BlockType.Spoken, 'one'],
      [BlockType.Spoken, 'two'],
      [BlockType.Spoken, 'three'],
      [BlockType.Spoken, '*emphasis* stays'],
    ]);
  });

  it('T3: CRLF line endings are handled and offsets still match the source', () => {
    const source = '# Title\r\nLine one\r\nline two\r\n\r\nNote: x';
    const blocks = parse(source);
    expect(blocks.map((block) => block.text)).toEqual(['Title', 'Line one\r\nline two', 'x']);
    for (const block of blocks) {
      expect(source.slice(block.source.start, block.source.end)).toBe(block.text);
    }
  });

  it('T3: ids come from the factory and order is sequential', () => {
    expect(parse('# a\n\nb').map((block) => [block.id, block.order])).toEqual([
      ['b1', 0],
      ['b2', 1],
    ]);
  });
});

describe('paste parser: tables', () => {
  it('T3: a header named Script/Line/Dialogue… picks the spoken column', () => {
    const blocks = parse('| Shot | Dialogue |\n|---|---|\n| Wide establishing view of the city | Hi. |');
    expect(blocks.map((block) => [block.type, block.text])).toEqual([
      [BlockType.Heading, 'Shot'],
      [BlockType.Heading, 'Dialogue'],
      [BlockType.Note, 'Wide establishing view of the city'],
      [BlockType.Spoken, 'Hi.'],
    ]);
    expect(blocks[0]?.metadata).toEqual({ tableHeader: true });
  });

  it('T3: without a named header the longest column is spoken; timestamp and number columns never are', () => {
    const blocks = parse(
      '| # | Time | Words |\n|---|---|---|\n| 1 | 0:05 | A long spoken sentence here. |\n| 2 | 0:10 | Another one. |',
    );
    const spoken = blocks.filter((block) => block.type === BlockType.Spoken).map((block) => block.text);
    expect(spoken).toEqual(['A long spoken sentence here.', 'Another one.']);

    const unnamed = parse('| A | B |\n|---|---|\n| 12:30 | This is the longer text |\n| 12:45 | Short |');
    expect(unnamed.filter((block) => block.type === BlockType.Spoken).map((block) => block.text)).toEqual([
      'This is the longer text',
      'Short',
    ]);
  });

  it('T3: tab-separated rows (pasted from Docs/Sheets) are a table with the first row as header', () => {
    const blocks = parse('Time\tLine\n0:01\tHello there.\n0:04\tWelcome.');
    expect(blocks.map((block) => [block.type, block.text, block.source.table?.row, block.source.table?.column])).toEqual([
      [BlockType.Heading, 'Time', 0, 0],
      [BlockType.Heading, 'Line', 0, 1],
      [BlockType.Note, '0:01', 1, 0],
      [BlockType.Spoken, 'Hello there.', 1, 1],
      [BlockType.Note, '0:04', 2, 0],
      [BlockType.Spoken, 'Welcome.', 2, 1],
    ]);
  });

  it('T3: empty cells produce no block but keep column numbering; escaped pipes stay in the cell', () => {
    const blocks = parse('| A | Script |\n|---|---|\n|  | Say a \\| b |');
    expect(blocks.map((block) => [block.text, block.source.table?.column])).toEqual([
      ['A', 0],
      ['Script', 1],
      ['Say a \\| b', 1],
    ]);
  });

  it('T3: a lone dashed line is not a table', () => {
    expect(typed('Hello\n---\nWorld').map(([, text]) => text)).toEqual(['Hello\n---\nWorld']);
  });

  it('T3: table cells keep an exact source range', () => {
    const source = 'Intro.\n\n| Line |\n|---|\n|  Keep  spacing inside |';
    for (const block of parse(source)) {
      expect(source.slice(block.source.start, block.source.end)).toBe(block.text);
    }
  });
});
