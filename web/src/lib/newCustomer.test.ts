import { describe, expect, it, vi } from 'vitest';

const single = vi.fn();
const chain = { insert: vi.fn(() => chain), select: vi.fn(() => chain), single };
vi.mock('./supabase', () => ({ supabase: { from: () => chain } }));
const { createCustomer, newCustomerFormFrom, newCustomerRow, splitName } = await import('./newCustomer');

describe('splitName', () => {
  it('reads "Last, First", "First Last" and one word', () => {
    expect(splitName(' Rally, Pat ')).toEqual({ first: 'Pat', last: 'Rally' });
    expect(splitName('Pat van Rally')).toEqual({ first: 'Pat', last: 'van Rally' });
    expect(splitName('Pat')).toEqual({ first: 'Pat', last: '' });
    expect(splitName('  ')).toEqual({ first: '', last: '' });
  });
});

describe('newCustomerRow', () => {
  it('needs both names, trims, and saves blanks as none', () => {
    expect(newCustomerRow({ ...newCustomerFormFrom('Pat'), phone: '', email: '' })).toEqual({
      error: 'First and last name are required',
    });
    expect(newCustomerRow({ firstName: ' Pat ', lastName: ' Rally ', phone: ' ', email: ' pat@x.test ' })).toEqual({
      first_name: 'Pat',
      last_name: 'Rally',
      phone_number: null,
      email: 'pat@x.test',
    });
  });
});

describe('createCustomer', () => {
  const row = { first_name: 'Pat', last_name: 'Rally', phone_number: null, email: null };

  it('inserts the row and returns the saved customer', async () => {
    single.mockResolvedValue({ data: { id: 'c1', ...row }, error: null });
    await expect(createCustomer(row)).resolves.toMatchObject({ id: 'c1', first_name: 'Pat' });
    expect(chain.insert).toHaveBeenCalledWith(row);
  });

  it('passes a failure on', async () => {
    const failure = { message: 'denied' };
    single.mockResolvedValue({ data: null, error: failure });
    await expect(createCustomer(row)).rejects.toBe(failure);
  });
});
