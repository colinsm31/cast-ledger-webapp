import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { staffLabel, type StaffRef } from '../../lib/staff';
import { statusText, unitChangeLabel, unitMoves, unitReasonProblem, type UnitMove } from '../../lib/unitStatus';
import type { ProductUnit, ProductUnitStatus, UnitStatusChange } from '../../types/domain';
import { sellUnitPath } from '../scan/scanFlow';
import { assignUnitLabels, labelsPath } from './unitLabel';
import { demoLoanLabel } from '../../lib/demoLoans';
import { PROMISE_STATE_CLASSES, promiseLabel, promiseState } from '../../lib/stringJobPromise';
import { customerNameLastFirst } from '../../types/domain';
import { DemoLoanActions } from '../demos/DemoLoanActions';
import { LendDemoForm } from '../demos/LendDemoForm';
import type { LoanWithCustomer } from '../demos/demoLoanQueries';

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
// A demo frame can be lent; one out on demo shows who has it and checks in
// (0071).
export function UnitRow({
  unit,
  loan,
  onChanged,
}: {
  unit: ProductUnit;
  /** The frame's open demo loan, when it's out. */
  loan?: LoanWithCustomer;
  onChanged: () => Promise<void> | void;
}) {
  const [move, setMove] = useState<UnitMove | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // A barcode typed or scanned in later (0068).
  const [addingBarcode, setAddingBarcode] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [lending, setLending] = useState(false);
  const navigate = useNavigate();

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
    await afterChange();
  }

  // The status changed: the history shown is out of date.
  async function afterChange() {
    setMove(null);
    setLending(false);
    setHistory(null);
    setShowHistory(false);
    await onChanged();
  }

  async function saveBarcode() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('set_unit_barcode', { p_unit_id: unit.id, p_barcode: barcode });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setAddingBarcode(false);
    await onChanged();
  }

  // A frame with no barcode gets the shop's next label code first.
  async function printLabel() {
    setError(null);
    try {
      await assignUnitLabels([unit.id]);
      navigate(labelsPath([unit.id]));
    } catch (err) {
      setError(errorMessage(err));
    }
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
          {!unit.barcode && !addingBarcode && (
            <button
              onClick={() => {
                setAddingBarcode(true);
                setBarcode('');
                setError(null);
              }}
              className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
            >
              Add barcode
            </button>
          )}
          <button
            onClick={() => void printLabel()}
            className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
          >
            Print label
          </button>
          {unit.status === 'demo' && !lending && !move && (
            <button
              onClick={() => setLending(true)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Lend
            </button>
          )}
          {!move &&
            !lending &&
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

      {loan && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Out with{' '}
            <Link to={`/customers/${loan.customer_id}`} className="text-blue-600 hover:underline">
              {loan.customers ? customerNameLastFirst(loan.customers) : 'a customer'}
            </Link>
            {` · ${demoLoanLabel(loan)} · `}
            <span className={PROMISE_STATE_CLASSES[promiseState(loan.due_back_at, new Date()) ?? 'later']}>
              {promiseLabel(loan.due_back_at, new Date())}
            </span>
            {loan.deposit_note ? ` · Deposit: ${loan.deposit_note}` : ''}
          </span>
          <DemoLoanActions loan={loan} onChanged={afterChange} />
        </div>
      )}

      {lending && <LendDemoForm unitId={unit.id} onLent={afterChange} onCancel={() => setLending(false)} />}

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

      {addingBarcode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          <input
            autoFocus
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && barcode.trim()) void saveBarcode();
            }}
            placeholder="Scan or type the frame’s barcode"
            className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            onClick={() => void saveBarcode()}
            disabled={saving || !barcode.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save barcode
          </button>
          <button onClick={() => setAddingBarcode(false)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
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
