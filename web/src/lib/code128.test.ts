import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, QUIET_ZONE, code128Bars, code128Values } from './code128';

describe('the Code 128 table', () => {
  it('has 107 distinct symbols, each 11 modules wide (the stop is 13)', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const modules = [...pattern].reduce((sum, width) => sum + Number(width), 0);
      expect(modules, `symbol ${value}`).toBe(value === 106 ? 13 : 11);
      // Bars come first and each symbol has an even count of bars and spaces (stop: 4 bars, 3 spaces).
      expect(pattern.length, `symbol ${value}`).toBe(value === 106 ? 7 : 6);
    });
  });
});

describe('code128Values', () => {
  it('encodes set B with its check symbol', () => {
    // Start B (104), P J J 1 2 3 C, check (104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7) mod 103 = 55, stop.
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });

  it('encodes a job number', () => {
    // J = 42, 1 = 17, 0 = 16, 4 = 20, 2 = 18; check (104 + 42 + 34 + 48 + 80 + 90) mod 103 = 89.
    expect(code128Values('J1042')).toEqual([104, 42, 17, 16, 20, 18, 89, 106]);
  });

  it('refuses what set B can\'t print', () => {
    expect(() => code128Values('')).toThrow('Nothing to encode');
    expect(() => code128Values('J10é')).toThrow('"é" can\'t be printed in a Code 128 barcode');
  });
});

describe('code128Bars', () => {
  it('lays the bars out left to right, between quiet zones', () => {
    const { bars, width } = code128Bars('J1042');
    // 7 symbols of 11 modules, the 13-module stop, and two quiet zones.
    expect(width).toBe(7 * 11 + 13 + 2 * QUIET_ZONE);
    // Start B is 211214: bars of 2, 1 and 1 at modules 0, 3 and 6.
    expect(bars.slice(0, 3)).toEqual([
      { x: QUIET_ZONE, width: 2 },
      { x: QUIET_ZONE + 3, width: 1 },
      { x: QUIET_ZONE + 6, width: 1 },
    ]);
    // The stop's last bar (2 wide) ends where the right quiet zone starts.
    const last = bars[bars.length - 1];
    expect(last.x + last.width).toBe(width - QUIET_ZONE);
    expect(bars).toHaveLength(7 * 3 + 4);
  });
});
