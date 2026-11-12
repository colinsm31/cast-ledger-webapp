import { useAuth } from '../../auth/AuthContext';
import { taxExemptLabel } from '../../lib/taxExempt';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// A customer's tax exemption in the customer forms. Only an admin can change
// it (the database refuses anyone else), so staff see it read-only.
export function TaxExemptFields({
  exempt,
  exemptId,
  onExempt,
  onExemptId,
}: {
  exempt: boolean;
  exemptId: string;
  onExempt: (exempt: boolean) => void;
  onExemptId: (id: string) => void;
}) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    const label = taxExemptLabel({ tax_exempt: exempt, tax_exempt_id: exemptId || null });
    return label ? <p className="text-sm text-slate-600">{label} (only an admin can change this)</p> : null;
  }
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={exempt} onChange={(e) => onExempt(e.target.checked)} />
        Tax exempt (their sales charge no tax)
      </label>
      {exempt && (
        <input
          value={exemptId}
          onChange={(e) => onExemptId(e.target.value)}
          placeholder="Exemption certificate number"
          aria-label="Exemption certificate number"
          className={inputClass}
        />
      )}
    </div>
  );
}
