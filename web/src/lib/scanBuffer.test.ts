import { describe, expect, it } from 'vitest';
import { createScanBuffer, ScanConstants } from './scanBuffer';

/** Feed `text` then Enter, `gapMs` apart, starting at `start`; returns Enter's result. */
function typeAndEnter(text: string, gapMs: number, start = 1000) {
  const buffer = createScanBuffer();
  let now = start;
  for (const ch of text) {
    expect(buffer.feed({ key: ch }, now)).toBeNull();
    now += gapMs;
  }
  return buffer.feed({ key: 'Enter' }, now);
}

describe('createScanBuffer', () => {
  it('returns a fast burst ending in Enter as a scan', () => {
    expect(typeAndEnter('012345678905', 10)).toBe('012345678905');
  });

  it('ignores slow typing', () => {
    expect(typeAndEnter('012345678905', ScanConstants.maxGapMs + 50)).toBeNull();
  });

  it('ignores one key plus Enter, and anything under the minimum length', () => {
    expect(typeAndEnter('a', 10)).toBeNull();
    expect(typeAndEnter('abc', 10)).toBeNull();
    expect(typeAndEnter('abcd', 10)).toBe('abcd');
  });

  it('ignores Enter with nothing typed', () => {
    expect(typeAndEnter('', 10)).toBeNull();
  });

  it('ignores shortcut keys and starts over after one', () => {
    const buffer = createScanBuffer();
    buffer.feed({ key: 'x' }, 0);
    expect(buffer.feed({ key: 'c', metaKey: true }, 10)).toBeNull();
    expect(buffer.feed({ key: 'v', ctrlKey: true }, 20)).toBeNull();
    expect(buffer.feed({ key: 'a', altKey: true }, 30)).toBeNull();
    for (const [i, ch] of [...'1234'].entries()) buffer.feed({ key: ch }, 40 + i * 10);
    expect(buffer.feed({ key: 'Enter' }, 80)).toBe('1234');
  });

  it('skips non-character keys like Shift without breaking the burst', () => {
    const buffer = createScanBuffer();
    buffer.feed({ key: 'Shift' }, 0);
    for (const [i, ch] of [...'GC-1'].entries()) buffer.feed({ key: ch }, 10 + i * 10);
    expect(buffer.feed({ key: 'Enter' }, 60)).toBe('GC-1');
  });

  it('starts a fresh code after each scan', () => {
    const buffer = createScanBuffer();
    for (const [i, ch] of [...'1111'].entries()) buffer.feed({ key: ch }, i * 10);
    expect(buffer.feed({ key: 'Enter' }, 40)).toBe('1111');
    for (const [i, ch] of [...'2222'].entries()) buffer.feed({ key: ch }, 50 + i * 10);
    expect(buffer.feed({ key: 'Enter' }, 90)).toBe('2222');
  });
});
