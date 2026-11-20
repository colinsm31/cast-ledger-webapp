// What a frame's printed label says (Phase 3B, 0068): its barcode and what
// it is. Labels go on frames received without a barcode.
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { JsonValue } from '../../types/domain';

export interface UnitLabel {
  unitId: string;
  code: string;
  /** "Head Speed MP". */
  title: string;
  /** Attribute values, "4 3/8 · 300 g". */
  details: string;
  price: number | null;
}

export interface LabelUnit {
  id: string;
  barcode: string | null;
  products: {
    brand: string | null;
    name: string;
    attributes: Record<string, JsonValue> | null;
    sell_price: number | null;
  } | null;
}

/** A frame's label, or null when it has no barcode to print. */
export function buildUnitLabel(unit: LabelUnit): UnitLabel | null {
  if (!unit.barcode) return null;
  const product = unit.products;
  const details = Object.values(product?.attributes ?? {})
    .filter((value) => value != null && value !== '')
    .map(String)
    .join(' · ');
  return {
    unitId: unit.id,
    code: unit.barcode,
    title: product ? [product.brand, product.name].filter(Boolean).join(' ') : '—',
    details,
    price: product?.sell_price ?? null,
  };
}

/** The ids passed to the labels page: "?ids=a,b,c". */
export function labelsPath(unitIds: string[]): string {
  return `/units/labels?ids=${unitIds.map(encodeURIComponent).join(',')}`;
}

/** Labels for these frames, in the order given. Throws when they can't be read. */
export async function fetchUnitLabels(unitIds: string[]): Promise<UnitLabel[]> {
  const { data, error } = await supabase
    .from('product_units')
    .select('id, barcode, products ( brand, name, attributes, sell_price )')
    .in('id', unitIds);
  if (error) throw new Error(`Couldn't load the frames: ${errorMessage(error)}`);
  const byId = new Map(((data ?? []) as unknown as LabelUnit[]).map((unit) => [unit.id, unit]));
  return unitIds
    .map((id) => byId.get(id))
    .map((unit) => (unit ? buildUnitLabel(unit) : null))
    .filter((label): label is UnitLabel => label !== null);
}

/** Give each frame its label code (keeping any barcode it has); returns the ids in order. */
export async function assignUnitLabels(unitIds: string[]): Promise<void> {
  for (const id of unitIds) {
    const { error } = await supabase.rpc('assign_unit_label', { p_unit_id: id });
    if (error) throw new Error(errorMessage(error));
  }
}
