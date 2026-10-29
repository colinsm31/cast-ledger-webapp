import { describe, expect, it } from 'vitest';
import { jobRowProblems, rowProblem } from './stringRow';
import type { CatalogString, RowSel } from './stringJobForm';

const catalog: CatalogString[] = [
  { id: 'b16', brand: 'Babolat', name: 'RPM Blast', attributes: { color: 'Black', gauge: '16' }, sellPrice: 19 },
  { id: 'b17', brand: 'Babolat', name: 'RPM Blast', attributes: { color: 'Black', gauge: '17' }, sellPrice: 19 },
  { id: 'lynx', brand: 'Head', name: 'Lynx', attributes: { color: 'Yellow' }, sellPrice: 16 },
];
const dims = ['color', 'gauge'];
const row = (patch: Partial<RowSel>): RowSel => ({ brand: '', name: '', specs: {}, tension: '', ...patch });
const complete = row({ brand: 'Babolat', name: 'RPM Blast', specs: { color: 'Black', gauge: '16' }, tension: '55' });

describe('rowProblem', () => {
  it('accepts a row that names one catalog string with a tension', () => {
    expect(rowProblem(catalog, dims, complete)).toBeNull();
  });

  it('asks for each column in order', () => {
    expect(rowProblem(catalog, dims, row({}))).toBe('choose a brand');
    expect(rowProblem(catalog, dims, row({ brand: 'Babolat' }))).toBe('choose a string');
    expect(rowProblem(catalog, dims, row({ brand: 'Babolat', name: 'RPM Blast' }))).toBe('choose a color');
    expect(rowProblem(catalog, dims, { ...complete, specs: { color: 'Black' } })).toBe('choose a gauge');
    expect(rowProblem(catalog, dims, { ...complete, tension: '' })).toBe('enter a tension');
  });

  it('refuses a tension that isn’t a positive number', () => {
    expect(rowProblem(catalog, dims, { ...complete, tension: 'abc' })).toBe('the tension must be a number, like 52 or 52.5');
    expect(rowProblem(catalog, dims, { ...complete, tension: '52lb' })).toBe('the tension must be a number, like 52 or 52.5');
    expect(rowProblem(catalog, dims, { ...complete, tension: '0' })).toBe('enter a tension');
  });

  it('says when the catalog string is missing an attribute', () => {
    expect(rowProblem(catalog, dims, row({ brand: 'Head', name: 'Lynx', specs: { color: 'Yellow' }, tension: '50' }))).toBe(
      'Head Lynx has no gauge set in the catalog — add it on the product first',
    );
  });

  it('refuses a combination the catalog doesn’t have', () => {
    expect(rowProblem(catalog, dims, { ...complete, specs: { color: 'Black', gauge: '18' } })).toBe(
      'that combination isn’t in the catalog',
    );
  });

  it('requires an attribute added later, like length', () => {
    const withLength = [...dims, 'length'];
    const lengthCatalog = catalog.map((c) => ({ ...c, attributes: { ...c.attributes, length: '12m' } }));
    expect(rowProblem(lengthCatalog, withLength, complete)).toBe('choose a length');
    expect(rowProblem(lengthCatalog, withLength, { ...complete, specs: { ...complete.specs, length: '12m' } })).toBeNull();
  });
});

describe('jobRowProblems', () => {
  it('labels each row’s problem', () => {
    expect(jobRowProblems(catalog, dims, complete, { ...complete, tension: '' })).toEqual(['Crosses: enter a tension']);
    expect(jobRowProblems(catalog, dims, row({}), complete)).toEqual(['Mains: choose a brand']);
    expect(jobRowProblems(catalog, dims, complete, complete)).toEqual([]);
  });
});
