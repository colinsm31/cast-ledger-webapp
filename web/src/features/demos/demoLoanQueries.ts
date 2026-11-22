// Reading demo loans (0071) with what the screens show next to them.
import { supabase } from '../../lib/supabase';
import type { Customer, DemoLoan } from '../../types/domain';

type CustomerRef = Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone_number'>;

/** A loan with its borrower. */
export type LoanWithCustomer = DemoLoan & { customers: CustomerRef | null };

/** A loan with its borrower and the frame (barcode, racquet). */
export type LoanWithFrame = LoanWithCustomer & {
  product_units: {
    id: string;
    barcode: string | null;
    product_id: string;
    products: { brand: string | null; name: string } | null;
  } | null;
};

const CUSTOMER = 'customers ( id, first_name, last_name, phone_number )';
const FRAME = 'product_units ( id, barcode, product_id, products ( brand, name ) )';

/** The open loan of each of these frames, by frame id. */
export async function fetchOpenLoansForUnits(unitIds: string[]): Promise<Map<string, LoanWithCustomer>> {
  if (unitIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('demo_loans')
    .select(`*, ${CUSTOMER}`)
    .is('back_at', null)
    .in('product_unit_id', unitIds);
  if (error) throw error;
  return new Map(((data ?? []) as unknown as LoanWithCustomer[]).map((loan) => [loan.product_unit_id, loan]));
}

/** Every loan still out. */
export async function fetchOpenLoans(): Promise<LoanWithFrame[]> {
  const { data, error } = await supabase
    .from('demo_loans')
    .select(`*, ${CUSTOMER}, ${FRAME}`)
    .is('back_at', null)
    .order('due_back_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LoanWithFrame[];
}

/** "Head Speed MP" from a frame's racquet. */
export function frameRacquetName(loan: LoanWithFrame): string {
  const product = loan.product_units?.products;
  return product ? [product.brand, product.name].filter(Boolean).join(' ') : 'Racquet';
}
