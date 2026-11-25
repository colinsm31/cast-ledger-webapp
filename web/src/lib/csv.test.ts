// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvCell, csvFileName, csvMoney, downloadCsv, localDateString, localDateTimeString, toCsv } from './csv';

describe('csvCell', () => {
  it('leaves plain text and numbers as they are', () => {
    expect(csvCell('Head')).toBe('Head');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3');
  });
  it('writes nothing for an empty value or a number that isn\'t one', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });
  it('writes Yes / No for true / false', () => {
    expect(csvCell(true)).toBe('Yes');
    expect(csvCell(false)).toBe('No');
  });
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Wilson, Pro Staff')).toBe('"Wilson, Pro Staff"');
    expect(csvCell('the "big" one')).toBe('"the ""big"" one"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });
  it('keeps text a spreadsheet would run as a formula as typed', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
});

describe('csvMoney', () => {
  it('rounds to cents', () => {
    expect(csvMoney(10.005)).toBe(10.01);
    expect(csvMoney(3)).toBe(3);
  });
  it('gives null for nothing', () => {
    expect(csvMoney(null)).toBeNull();
    expect(csvMoney(undefined)).toBeNull();
    expect(csvMoney(Number.NaN)).toBeNull();
  });
});

describe('toCsv', () => {
  it('writes a header row and rows with CRLF line ends', () => {
    expect(toCsv(['A', 'B'], [[1, 'x'], [null, 'y,z']])).toBe('A,B\r\n1,x\r\n,"y,z"\r\n');
  });
});

describe('dates', () => {
  it('writes local dates as YYYY-MM-DD', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('writes a moment as YYYY-MM-DD HH:MM in local time', () => {
    expect(localDateTimeString(new Date(2026, 10, 25, 9, 7).toISOString())).toBe('2026-11-25 09:07');
    expect(localDateTimeString(null)).toBe('');
    expect(localDateTimeString('nope')).toBe('');
  });
});

describe('csvFileName', () => {
  it('names the file after the report', () => {
    expect(csvFileName('Sales by brand')).toBe('sales-by-brand.csv');
    expect(csvFileName('!!!')).toBe('export.csv');
  });
  it('adds the days a [from, to) range covers', () => {
    const range = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 26) };
    expect(csvFileName('Sales', range)).toBe('sales_2026-11-01_to_2026-11-25.csv');
  });
  it('names one day once', () => {
    expect(csvFileName('Sales', { from: new Date(2026, 10, 25), to: new Date(2026, 10, 25, 15) })).toBe(
      'sales_2026-11-25.csv',
    );
    expect(csvFileName('Sales', { from: new Date(2026, 10, 25), to: new Date(2026, 10, 25) })).toBe(
      'sales_2026-11-25.csv',
    );
  });
});

describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks());
  it('saves the text as a UTF-8 CSV file with a byte-order mark', async () => {
    let saved: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadCsv('a.csv', 'A\r\n');
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(saved!.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await saved!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
