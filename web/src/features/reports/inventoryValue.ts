// Inventory value at cost (report_inventory_value, 0097): rows and totals by
// category or brand.

import { roundCents } from '../../lib/money';

export interface InventoryValueRow {
  product_id: string;
  product: string;
  category: string | null;
  brand: string | null;
  is_serialized: boolean;
  on_hand: number;
  cost: number | null;
  sell_price: number | null;
  value_at_cost: number | null;
  retail_value: number | null;
  demo_frames: number;
  demo_value_at_cost: number | null;
}

export interface InventoryGroupRow {
  name: string;
  products: number;
  on_hand: number;
  value_at_cost: number;
  retail_value: number;
  without_cost: number;
  demo_frames: number;
  demo_value_at_cost: number;
}

export type InventoryGrouping = 'product' | 'category' | 'brand';


/** The products' figures added up by category or brand, sorted by value. */
export function inventoryByGroup(rows: InventoryValueRow[], grouping: 'category' | 'brand'): InventoryGroupRow[] {
  const groups = new Map<string, InventoryGroupRow>();
  for (const row of rows) {
    const name = (grouping === 'category' ? row.category : row.brand) ?? (grouping === 'category' ? '(no category)' : '(no brand)');
    const group = groups.get(name) ?? {
      name, products: 0, on_hand: 0, value_at_cost: 0, retail_value: 0, without_cost: 0, demo_frames: 0, demo_value_at_cost: 0,
    };
    group.products += 1;
    group.on_hand += Number(row.on_hand);
    group.value_at_cost += Number(row.value_at_cost ?? 0);
    group.retail_value += Number(row.retail_value ?? 0);
    if (row.cost === null && (Number(row.on_hand) > 0 || row.demo_frames > 0)) group.without_cost += 1;
    group.demo_frames += row.demo_frames;
    group.demo_value_at_cost += Number(row.demo_value_at_cost ?? 0);
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      value_at_cost: roundCents(g.value_at_cost),
      retail_value: roundCents(g.retail_value),
      demo_value_at_cost: roundCents(g.demo_value_at_cost),
    }))
    .sort((a, b) => b.value_at_cost - a.value_at_cost || a.name.localeCompare(b.name));
}
