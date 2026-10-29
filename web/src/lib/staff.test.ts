import { describe, expect, it } from 'vitest';
import { ROLE_LABEL, staffLabel } from './staff';

describe('staffLabel', () => {
  it("shows the staff member's email, or nothing when nobody is recorded", () => {
    expect(staffLabel({ email: 'pat@shop.test' })).toBe('pat@shop.test');
    expect(staffLabel({ email: null })).toBeNull();
    expect(staffLabel(null)).toBeNull();
    expect(staffLabel(undefined)).toBeNull();
  });
});

describe('ROLE_LABEL', () => {
  it('names an unapproved account "no access"', () => {
    expect(ROLE_LABEL).toEqual({ admin: 'admin', staff: 'staff', pending: 'no access' });
  });
});
