// Domain types mirroring the CastLedger Postgres schema. The flexible JSONB
// columns (spec_values, spec_template, etc.) are typed as JsonValue.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SpecValueType = 'number' | 'text' | 'enum' | 'bool' | 'ref' | 'list';

export type PieceStatus =
  | 'in_production'
  | 'curing'
  | 'qc'
  | 'ready'
  | 'staged'
  | 'delivered';

export type ProjectStatus = 'active' | 'closed' | 'on_hold';

export type QCTestType = 'break_7day' | 'break_28day' | 'water_test' | 'other';

export interface QCTest {
  id: string;
  piece_id: string | null;
  batch_no: string | null;
  test_type: QCTestType;
  value: number | null;
  unit: string | null;
  pass: boolean | null;
  tested_at: string;
  tested_by: string | null;
}

// The forward lifecycle order; index defines the single legal next step.
export const PIECE_STATUS_ORDER: PieceStatus[] = [
  'in_production',
  'curing',
  'qc',
  'ready',
  'staged',
  'delivered',
];

export function nextPieceStatus(status: PieceStatus): PieceStatus | null {
  const index = PIECE_STATUS_ORDER.indexOf(status);
  if (index < 0 || index >= PIECE_STATUS_ORDER.length - 1) return null;
  return PIECE_STATUS_ORDER[index + 1];
}

export interface Project {
  id: string;
  job_number: string;
  name: string;
  client: string | null;
  location: string | null;
  status: ProjectStatus;
  is_stock: boolean;
  created_at: string;
}

export interface ProductDesign {
  id: string;
  drawing_no: string;
  family: string;
  name: string;
  base_specs: JsonValue;
  spec_template: JsonValue;
  default_components: JsonValue;
  revision: number;
  superseded_by_id: string | null;
  created_at: string;
}

export interface SpecAttribute {
  id: string;
  owner_type: 'category' | 'product_design';
  owner_id: string;
  name: string;
  value_type: SpecValueType;
  unit: string | null;
  required: boolean;
  qc_gate: boolean;
  valid_min: number | null;
  valid_max: number | null;
  enum_values: JsonValue | null;
  created_at: string;
}

export interface Piece {
  id: string;
  mark_no: string;
  project_id: string | null;
  product_design_id: string;
  product_design_revision: number;
  cast_run_id: string | null;
  spec_values: Record<string, JsonValue>;
  as_built_components: JsonValue;
  weight_lb: number | null;
  status: PieceStatus;
  yard_location: string | null;
  created_at: string;
  updated_at: string;
}

// A piece joined with its design summary (PostgREST embedded select).
export interface PieceWithDesign extends Piece {
  product_designs: {
    family: string;
    name: string;
    drawing_no: string;
    revision: number;
  } | null;
}

export interface LookupValue {
  id: string;
  kind: string;
  value: string;
  created_at: string;
}

export type LookupKind = 'unit' | 'field_name' | 'enum_value';

// ---- RPC param shapes ----

export interface CreateProductDesignParams {
  p_drawing_no: string;
  p_family: string;
  p_name: string;
  p_revision: number;
  p_attributes: Array<{
    name: string;
    value_type: SpecValueType;
    unit: string | null;
    required: boolean;
    qc_gate: boolean;
    valid_min: string | null;
    valid_max: string | null;
    enum_values: string[] | null;
  }>;
}

export interface CreatePieceParams {
  p_mark_no: string;
  p_product_design_id: string;
  p_project_id: string | null;
  p_spec_values: Record<string, JsonValue>;
  p_weight_lb: number | null;
  p_yard_location: string | null;
}
