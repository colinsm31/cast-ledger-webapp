import { describe, expect, it } from 'vitest';
import {
  applyDiscounts,
  describeDiscount,
  discountEachCents,
  discountProblems,
  isApprovalProblem,
  parseDiscount,
  savedDiscountCents,
  savedDiscountNote,
  savedTicketDiscountNote,
} from './discounts';

describe('parseDiscount', () => {
  it('reads blank and 0 as no discount', () => {
    expect(parseDiscount('')).toEqual({ discount: null });
    expect(parseDiscount('  ')).toEqual({ discount: null });
    expect(parseDiscount(undefined)).toEqual({ discount: null });
    expect(parseDiscount('0')).toEqual({ discount: null });
  });

  it('reads percents, dollars and 100%', () => {
    expect(parseDiscount('0.25')).toEqual({ discount: 0.25 });
    expect(parseDiscount('.1')).toEqual({ discount: 0.1 });
    expect(parseDiscount('3')).toEqual({ discount: 3 });
    expect(parseDiscount('2.50')).toEqual({ discount: 2.5 });
    expect(parseDiscount('1')).toEqual({ discount: 1 });
  });

  it('refuses text, negatives, part-cents and too many percent decimals', () => {
    expect(parseDiscount('25%')).toHaveProperty('error');
    expect(parseDiscount('-3')).toHaveProperty('error');
    expect(parseDiscount('3.005')).toEqual({ error: 'a dollar discount must be in whole cents' });
    expect(parseDiscount('0.12345')).toHaveProperty('error');
    expect(parseDiscount('0.1234')).toEqual({ discount: 0.1234 });
  });
});

describe('describeDiscount', () => {
  it('names each kind', () => {
    expect(describeDiscount(0.25)).toBe('25% off');
    expect(describeDiscount(0.125)).toBe('12.5% off');
    expect(describeDiscount(1)).toBe('100% off');
    expect(describeDiscount(3)).toBe('$3.00 off each');
    expect(describeDiscount(3, 'the ticket')).toBe('$3.00 off the ticket');
  });
});

describe('discountEachCents', () => {
  it('rounds a percent to the cent, half up', () => {
    expect(discountEachCents(2000, 0.1)).toBe(200);
    expect(discountEachCents(999, 0.15)).toBe(150); // 149.85
    expect(discountEachCents(1050, 0.05)).toBe(53); // 52.5
  });

  it('takes 100% and dollars as they are', () => {
    expect(discountEachCents(2000, 1)).toBe(2000);
    expect(discountEachCents(2000, 3)).toBe(300);
    expect(discountEachCents(2000, null)).toBe(0);
  });

  it('refuses more dollars off than the price', () => {
    expect(() => discountEachCents(200, 3)).toThrow('A $3.00 discount is more than the $2.00 price');
  });
});

describe('applyDiscounts', () => {
  it('takes the line discount, then the ticket discount, off each item', () => {
    const result = applyDiscounts([{ qty: 2, price: '20', discount: '0.1' }], '3');
    expect(result.lines).toEqual([{ price: '16.50', lineDiscountEachCents: 200, ticketDiscountEachCents: 150 }]);
    expect(result.discountCents).toBe(700);
    expect(result.error).toBeNull();
  });

  it('shares a dollar ticket discount by price, so it can land a cent off', () => {
    const result = applyDiscounts([{ qty: 3, price: '20' }], '5');
    expect(result.lines[0].price).toBe('18.33');
    expect(result.discountCents).toBe(501);
  });

  it('applies a percent ticket discount to what each item costs after its line discount', () => {
    const result = applyDiscounts(
      [
        { qty: 1, price: '20', discount: '5' },
        { qty: 1, price: '9.99' },
      ],
      '0.1',
    );
    expect(result.lines.map((line) => line.price)).toEqual(['13.50', '8.99']);
  });

  it('leaves gift card loads alone', () => {
    const result = applyDiscounts(
      [
        { qty: 1, price: '50', giftCardId: 'g1' },
        { qty: 1, price: '20' },
      ],
      '1',
    );
    expect(result.lines.map((line) => line.price)).toEqual(['50.00', '0.00']);
    expect(result.discountCents).toBe(2000);
  });

  it('reports a ticket discount bigger than the items, and leaves prices as typed', () => {
    const result = applyDiscounts([{ qty: 1, price: '20', discount: '0.5' }], '15');
    expect(result.error).toBe('A $15.00 ticket discount is more than the $10.00 of items it applies to');
    expect(result.lines[0].price).toBe('20.00');
    expect(result.discountCents).toBe(0);
  });
});

describe('discountProblems', () => {
  const line = { label: 'Overgrip', qty: 1, price: '20' };

  it('wants a reason for each discount', () => {
    expect(discountProblems([{ ...line, discount: '0.1' }], { discount: '2' })).toEqual([
      'Overgrip: give a reason for the discount.',
      'Ticket discount: give a reason.',
    ]);
    expect(
      discountProblems([{ ...line, discount: '0.1', discountReason: 'Promotion' }], {
        discount: '2',
        discountReason: ' Loyalty ',
      }),
    ).toEqual([]);
  });

  it('names a box that can’t be read, a gift card discount, and too much off', () => {
    expect(
      discountProblems(
        [
          { ...line, discount: 'ten' },
          { label: 'Gift card 123', qty: 1, price: '25', giftCardId: 'g1', discount: '0.1', discountReason: 'x' },
          { label: 'Balls', qty: 1, price: '2', discount: '3', discountReason: 'Damaged' },
        ],
        {},
      ),
    ).toEqual([
      'Overgrip: discount: enter a number: 0.25 for 25% off, 3 for $3 off, 1 for 100% off.',
      "Gift card 123: a gift card sale can't be discounted.",
      'A $3.00 discount is more than the $2.00 price.',
    ]);
  });
});

describe('isApprovalProblem', () => {
  it('spots the staff limit and a used-up approval, only for the whole ticket', () => {
    expect(isApprovalProblem({ line: null, message: '50% off is over the staff limit of 20%: an admin must approve it' })).toBe(true);
    expect(
      isApprovalProblem({
        line: null,
        message: "The admin approval doesn't cover 50% off (it may have expired or been used): ask again",
      }),
    ).toBe(true);
    expect(isApprovalProblem({ line: null, message: 'Ticket discount: give a reason' })).toBe(false);
    expect(isApprovalProblem({ line: 0, message: 'an admin must approve it' })).toBe(false);
  });
});

describe('savedDiscountCents', () => {
  it('adds up what each discounted line took off', () => {
    expect(
      savedDiscountCents([
        { qty: 2, unit_price: '16.50', price_before_discount: '20.00', line_discount: '0.1', ticket_discount_each: '1.5', discount_reason: 'x' },
        { qty: 1, unit_price: '5.00', price_before_discount: null, line_discount: null, ticket_discount_each: null, discount_reason: null },
      ]),
    ).toBe(700);
  });
});

describe('savedTicketDiscountNote', () => {
  it('names the ticket discount and its reason', () => {
    expect(savedTicketDiscountNote('0.1000', 'Loyalty')).toBe('10% off · Loyalty');
    expect(savedTicketDiscountNote('5.0000', null)).toBe('$5.00 off the ticket');
    expect(savedTicketDiscountNote(null, null)).toBeNull();
  });
});

describe('savedDiscountNote', () => {
  const saved = {
    unit_price: '16.50',
    price_before_discount: '20.00',
    line_discount: '0.1000',
    ticket_discount_each: '1.50',
    discount_reason: 'Promotion',
  };

  it('shows the price before and after, and each part', () => {
    expect(savedDiscountNote(saved)).toBe('$20.00 → $16.50 · 10% off · Promotion + ticket discount');
    expect(savedDiscountNote({ ...saved, ticket_discount_each: null })).toBe('$20.00 → $16.50 · 10% off · Promotion');
    expect(savedDiscountNote({ ...saved, line_discount: null, discount_reason: null })).toBe(
      '$20.00 → $16.50 · ticket discount',
    );
  });

  it('says nothing for a line without a discount', () => {
    expect(savedDiscountNote({ ...saved, price_before_discount: null })).toBeNull();
  });
});
