import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { staffLabel, type StaffRef } from '../../lib/staff';
import { statusText, unitChangeLabel, unitMoves, unitReasonProblem, type UnitMove } from '../../lib/unitStatus';
import type { ProductUnit, ProductUnitStatus, UnitStatusChange } from '../../types/domain';
import { sellUnitPath } from '../scan/scanFlow';

// MARK: - Status styling

const STATUS_STYLE: Record<ProductUnitStatus, string> = {
  in_stock: 'bg-green-100 text-green-800',
  sold: 'bg-slate-100 text-slate-600',
  demo: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  retired: 'bg-red-100 text-red-700',
};

type HistoryRow = UnitStatusChange & { changed_by_staff: StaffRef | null };

// MARK: - UnitRow
//
// One frame: its barcode and status, Sell while it's in stock, moving it to
// demo, retiring it or putting it back with a reason, and its history (0067).
export function UnitRow({ unit, onChanged }: { unit: ProductUnit; onChanged: () => Promise<void> | void }) {
  const [move, setMove] = useState<UnitMove | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const problem = move ? unitReasonProblem(reason) : null;

  function startMove(next: UnitMove) {
    setMove(next);
    setReason('');
    setError(null);
  }

  async function saveMove() {
    if (!move || problem) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('set_unit_status', {
      p_unit_id: unit.id,
      p_status: move.to,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setMove(null);
    setHistory(null);
    setShowHistory(false);
    await onChanged();
  }

  async function toggleHistory() {
    const opening = !showHistory;
    setShowHistory(opening);
    if (!opening || history) return;
    const { data, error: err } = await supabase
      .from('unit_status_changes')
      .select('*, changed_by_staff:profiles!unit_status_changes_changed_by_fkey ( email )')
      .eq('product_unit_id', unit.id)
      .order('changed_at', { ascending: true });
    if (err) setError(`Couldn't load the history: ${errorMessage(err)}`);
    else setHistory((data ?? []) as unknown as HistoryRow[]);
  }

  return (
    <li className="space-y-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={unit.barcode ? 'font-mono text-slate-900' : 'italic text-slate-400'}>
          {unit.barcode ?? 'No barcode'}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {unit.status === 'in_stock' && (
            <Link to={sellUnitPath(unit.id)} className="text-xs font-medium text-blue-600 hover:underline">
              Sell
            </Link>
          )}
          {!move &&
            unitMoves(unit.status).map((option) => (
              <button
                key={option.to}
                onClick={() => startMove(option)}
                className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
              >
                {option.label}
              </button>
            ))}
          <button
            onClick={() => void toggleHistory()}
            aria-expanded={showHistory}
            className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
          >
            History
          </button>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[unit.status]}`}>
            {statusText(unit.status)}
          </span>
        </div>
      </div>

      {move && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          <label className="flex min-w-[14rem] flex-1 items-center gap-2">
            <span className="text-xs font-medium text-slate-600">{move.label}: why?</span>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={move.to === 'retired' ? 'e.g. cracked throat' : 'e.g. demo fleet'}
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={() => void saveMove()}
            disabled={saving || !!problem}
            className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : move.label}
          </button>
          <button onClick={() => setMove(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {showHistory && history && (
        <ol className="space-y-0.5 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
          {history.map((change) => (
            <li key={change.id}>
              <span className="font-medium text-slate-800">{unitChangeLabel(change)}</span>
              {' · '}
              {new Date(change.changed_at).toLocaleString()}
              {staffLabel(change.changed_by_staff) ? ` · ${staffLabel(change.changed_by_staff)}` : ''}
              {change.reason ? ` · “${change.reason}”` : ''}
              {change.sale_id && (
                <>
                  {' · '}
                  <Link to={`/sales/${change.sale_id}`} className="text-blue-600 hover:underline">
                    sale
                  </Link>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
