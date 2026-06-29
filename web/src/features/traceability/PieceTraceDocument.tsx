import type { JsonValue, PieceWithDesign, QCTest } from '../../types/domain';

// A single piece's traceability section. Pure presentational — given the data,
// renders the document body. Reused by the per-piece page and composed into the
// per-project package.

const TEST_TYPE_LABEL: Record<string, string> = {
  break_7day: 'Break — 7 day',
  break_28day: 'Break — 28 day',
  water_test: 'Water test',
  other: 'Other',
};

function displayValue(value: JsonValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export function PieceTraceDocument({
  piece,
  tests,
  projectLabel,
}: {
  piece: PieceWithDesign;
  tests: QCTest[];
  projectLabel?: string;
}) {
  const specEntries = Object.entries(piece.spec_values ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <article className="trace-piece space-y-4 text-slate-900">
      <header className="border-b border-slate-300 pb-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Piece {piece.mark_no}</h2>
          <span className="text-sm capitalize text-slate-600">
            {piece.status.replace(/_/g, ' ')}
          </span>
        </div>
      </header>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Identification
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <TraceRow label="Mark number" value={piece.mark_no} />
          {projectLabel && <TraceRow label="Project" value={projectLabel} />}
          <TraceRow label="Family" value={piece.product_designs?.family ?? '—'} />
          <TraceRow label="Design" value={piece.product_designs?.name ?? '—'} />
          <TraceRow label="Drawing no." value={piece.product_designs?.drawing_no ?? '—'} />
          <TraceRow label="As-poured revision" value={`rev ${piece.product_design_revision}`} />
          {piece.weight_lb != null && <TraceRow label="Weight" value={`${piece.weight_lb} lb`} />}
          {piece.yard_location && <TraceRow label="Yard location" value={piece.yard_location} />}
          <TraceRow label="Created" value={formatDate(piece.created_at)} />
        </dl>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Specifications
        </h3>
        {specEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No spec values recorded.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {specEntries.map(([key, value]) => (
              <TraceRow key={key} label={key} value={displayValue(value)} />
            ))}
          </dl>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quality control
        </h3>
        {tests.length === 0 ? (
          <p className="text-sm text-slate-500">No QC tests recorded.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-2 font-semibold">Test</th>
                <th className="py-1 pr-2 font-semibold">Value</th>
                <th className="py-1 pr-2 font-semibold">Result</th>
                <th className="py-1 pr-2 font-semibold">Date</th>
                <th className="py-1 font-semibold">By</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2">{TEST_TYPE_LABEL[test.test_type] ?? test.test_type}</td>
                  <td className="py-1 pr-2">
                    {test.value != null ? `${test.value}${test.unit ? ` ${test.unit}` : ''}` : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    {test.pass === true ? 'Pass' : test.pass === false ? 'Fail' : '—'}
                  </td>
                  <td className="py-1 pr-2">{formatDate(test.tested_at)}</td>
                  <td className="py-1">{test.tested_by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
