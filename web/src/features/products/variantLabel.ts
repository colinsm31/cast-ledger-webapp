import type { AttributeDef, JsonValue, Variant } from '../../types/domain';

// A readable label for a variant from its variant_values, in attribute-def order
// (e.g. "16 · Black"). Falls back to "Default" for a variant with no dimensions.
export function variantLabel(
  variant: Pick<Variant, 'variant_values'>,
  defs: AttributeDef[],
): string {
  const parts = defs
    .map((def) => variant.variant_values?.[def.name])
    .filter((v): v is JsonValue => v != null && v !== '')
    .map((v) => String(v));
  return parts.length > 0 ? parts.join(' · ') : 'Default';
}
