import { describe, expect, it } from 'vitest';
import {
  duplicateEnumValue,
  enumValueChanges,
  enumValueRowsFrom,
  newEnumValueRow,
  productsUpdatedNote,
} from './attributeValues';

describe('enumValueChanges', () => {
  it('keeps unchanged values without renames', () => {
    expect(enumValueChanges(enumValueRowsFrom(['S', 'M']))).toEqual({ values: ['S', 'M'], renames: {} });
  });

  it('treats an edited existing row as a rename', () => {
    const rows = enumValueRowsFrom(['16', '16L']);
    rows[1] = { ...rows[1], value: ' 16 Light ' };
    expect(enumValueChanges(rows)).toEqual({ values: ['16', '16 Light'], renames: { '16L': '16 Light' } });
  });

  it('adds new rows as values, not renames', () => {
    const rows = [...enumValueRowsFrom(['S']), { ...newEnumValueRow(), value: 'XL' }];
    expect(enumValueChanges(rows)).toEqual({ values: ['S', 'XL'], renames: {} });
  });

  it('drops blank rows, so a cleared value is removed', () => {
    const rows = [...enumValueRowsFrom(['S', 'M']), newEnumValueRow()];
    rows[1] = { ...rows[1], value: '  ' };
    expect(enumValueChanges(rows)).toEqual({ values: ['S'], renames: {} });
  });
});

describe('newEnumValueRow', () => {
  it('gives each row its own key', () => {
    expect(newEnumValueRow().key).not.toBe(newEnumValueRow().key);
  });
});

describe('duplicateEnumValue', () => {
  it('finds a value listed twice', () => {
    expect(duplicateEnumValue(['S', 'M', 'S'])).toBe('S');
    expect(duplicateEnumValue(['S', 'M'])).toBeNull();
  });
});

describe('productsUpdatedNote', () => {
  it('says how many products were updated', () => {
    expect(productsUpdatedNote(0)).toBe('Saved');
    expect(productsUpdatedNote(1)).toBe('Saved · 1 product updated');
    expect(productsUpdatedNote(12)).toBe('Saved · 12 products updated');
  });
});
