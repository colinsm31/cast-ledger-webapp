import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseLayout, pageRule, rememberedLayout, rememberLayout } from './receiptLayout';

describe('chooseLayout', () => {
  it('takes the address first, then this device’s last, then thermal', () => {
    expect(chooseLayout('letter', 'thermal')).toBe('letter');
    expect(chooseLayout(null, 'letter')).toBe('letter');
    expect(chooseLayout('poster', 'nonsense')).toBe('thermal');
    expect(chooseLayout(null, null)).toBe('thermal');
  });
});

describe('remembering the layout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the last layout on this device', () => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    });
    rememberLayout('letter');
    expect(rememberedLayout()).toBe('letter');
  });

  it('treats blocked storage as nothing remembered', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberLayout('letter')).not.toThrow();
    expect(rememberedLayout()).toBeNull();
  });
});

describe('pageRule', () => {
  it('sizes the page for each printer', () => {
    expect(pageRule('thermal')).toContain('80mm');
    expect(pageRule('letter')).toContain('letter');
  });
});
