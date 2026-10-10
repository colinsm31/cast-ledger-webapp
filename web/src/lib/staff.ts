// A staff member embedded from `profiles` through an attribution column
// (e.g. `rung_by:profiles!sales_user_id_fkey ( email )`).
export interface StaffRef {
  email: string | null;
}

/** How a staff member is shown next to a record; null when nobody is recorded. */
export function staffLabel(staff: StaffRef | null | undefined): string | null {
  return staff?.email ?? null;
}
