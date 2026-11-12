import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const {
  fetchSaleQuote,
  isTotalMismatchError,
  parseSaleQuote,
  quoteChangeNotice,
  quoteProblemMessages,
  toSaleLinePayload,
} = await import('./saleQuote');

describe('toSaleLinePayload', () => {
  it('sends a string job once, at its price', () => {
    expect(toSaleLinePayload({ stringJobId: 'j1', qty: 1, price: '30.00' })).toEqual({
      string_job_id: 'j1',
      qty: 1,
      unit_price: 30,
    });
  });

  it('sends a gift card load', () => {
    expect(toSaleLinePayload({ giftCardId: 'g1', qty: 1, price: 50 })).toEqual({
      gift_card_id: 'g1',
      qty: 1,
      unit_price: 50,
    });
  });

  it('sends a tracked unit as one of its product', () => {
    expect(toSaleLinePayload({ productId: 'p1', productUnitId: 'u1', qty: 3, price: '250' })).toEqual({
      product_id: 'p1',
      product_unit_id: 'u1',
      qty: 1,
      unit_price: 250,
    });
  });

  it('sends a product with its quantity, and a blank price as 0', () => {
    expect(toSaleLinePayload({ productId: 'p1', qty: 2, price: '' })).toEqual({
      product_id: 'p1',
      qty: 2,
      unit_price: 0,
    });
  });
});

describe('toSaleLinePayload price reasons', () => {
  it('sends a trimmed reason with the line', () => {
    expect(toSaleLinePayload({ productId: 'p1', qty: 1, price: '15', priceReason: '  Price match ' })).toEqual({
      product_id: 'p1',
      qty: 1,
      unit_price: 15,
      price_reason: 'Price match',
    });
  });

  it('leaves a blank reason off', () => {
    expect(toSaleLinePayload({ stringJobId: 'j1', qty: 1, price: '25', priceReason: '   ' })).toEqual({
      string_job_id: 'j1',
      qty: 1,
      unit_price: 25,
    });
  });
});

describe('parseSaleQuote', () => {
  it("reads each line's list price, keeping none as null", () => {
    expect(
      parseSaleQuote({
        subtotal: 45,
        tax: 0,
        tax_rate: 0,
        total: 45,
        problems: [],
        lines: [{ list_price: '20.00' }, { list_price: null }],
      }).listPrices,
    ).toEqual([20, null]);
  });

  it('turns the database numbers into numbers', () => {
    expect(
      parseSaleQuote({ subtotal: '20', tax: '1.80', tax_rate: '9.000', total: '21.80', problems: null }),
    ).toEqual({ subtotal: 20, tax: 1.8, taxRate: 9, total: 21.8, problems: [], listPrices: [] });
  });
});

describe('fetchSaleQuote', () => {
  beforeEach(() => rpc.mockReset());

  it('asks quote_sale with the ticket lines and customer', async () => {
    rpc.mockResolvedValue({
      data: { subtotal: 20, tax: 1.65, tax_rate: 8.25, total: 21.65, problems: [] },
      error: null,
    });
    await expect(fetchSaleQuote([{ productId: 'p1', qty: 1, price: '20' }], 'c1')).resolves.toEqual({
      subtotal: 20,
      tax: 1.65,
      taxRate: 8.25,
      total: 21.65,
      problems: [],
      listPrices: [],
    });
    expect(rpc).toHaveBeenCalledWith('quote_sale', {
      p_lines: [{ product_id: 'p1', qty: 1, unit_price: 20 }],
      p_customer_id: 'c1',
    });
  });

  it('passes a failure on', async () => {
    const failure = { message: 'permission denied' };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(fetchSaleQuote([{ productId: 'p1', qty: 1, price: 1 }], null)).rejects.toBe(failure);
  });
});

describe('quoteProblemMessages', () => {
  it('names each line, in ticket order', () => {
    expect(
      quoteProblemMessages(
        [
          { line: 2, message: 'This string job is already paid' },
          { line: 0, message: 'This unit is no longer in stock (sold)' },
        ],
        ['Pro Staff 97', 'Overgrip', 'Stringing — Blade 98'],
      ),
    ).toEqual(['Pro Staff 97: This unit is no longer in stock (sold)', 'Stringing — Blade 98: This string job is already paid']);
  });

  it('falls back to the line number when the label is missing', () => {
    expect(quoteProblemMessages([{ line: 4, message: 'Gone' }], [])).toEqual(['Line 5: Gone']);
  });

  it('puts whole-ticket problems last, as they are', () => {
    expect(
      quoteProblemMessages(
        [
          { line: null, message: '25% off is over the staff limit of 20%: an admin must approve it' },
          { line: 0, message: 'Discount: give a reason' },
        ],
        ['Overgrip'],
      ),
    ).toEqual(['Overgrip: Discount: give a reason', '25% off is over the staff limit of 20%: an admin must approve it']);
  });
});

describe('quoteChangeNotice', () => {
  const shown = { subtotal: 20, tax: 1.65, total: 21.65 };
  const quote = { subtotal: 20, tax: 1.65, taxRate: 8.25, total: 21.65, problems: [], listPrices: [] };

  it('says nothing when the server agrees with the ticket', () => {
    expect(quoteChangeNotice(shown, 8.25, quote)).toBeNull();
  });

  it('names the new rate when the rate changed', () => {
    expect(quoteChangeNotice(shown, 8.25, { ...quote, tax: 1.8, taxRate: 9, total: 21.8 })).toBe(
      'The tax rate is now 9% (it was 8.25%), so the total is $21.80, not $21.65.',
    );
  });

  it('blames the tax settings when the rate is the same (e.g. stringing became taxed)', () => {
    expect(quoteChangeNotice(shown, 8.25, { ...quote, total: 24.13 })).toBe(
      "The shop's tax settings changed, so the total is $24.13, not $21.65.",
    );
  });
});

describe('isTotalMismatchError', () => {
  it('spots record_sale refusing payments that no longer match', () => {
    expect(
      isTotalMismatchError({
        message:
          'Payments ($21.65) must equal the sale total ($21.80). The total may have changed: go back and check the ticket.',
      }),
    ).toBe(true);
  });

  it('ignores other errors and non-errors', () => {
    expect(isTotalMismatchError({ message: 'Gift card balance 5 is less than 10' })).toBe(false);
    expect(isTotalMismatchError('must equal the sale total')).toBe(false);
    expect(isTotalMismatchError(null)).toBe(false);
  });
});
