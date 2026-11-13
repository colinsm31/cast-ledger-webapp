import { useCallback, useEffect, useState } from 'react';
import { discardHeldTicket, heldItemsLabel, listHeldTickets, type HeldTicketRow } from '../../lib/heldTickets';
import { errorMessage } from '../../lib/errors';
import { staffLabel } from '../../lib/staff';
import { customerName } from '../../types/domain';
import { useDialog } from '../../components/Dialog';

function heldAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

// Every ticket on hold, from any register: recall one onto this register, or
// throw it away.
export function HeldTicketsPanel({ onRecall, onClose }: { onRecall: (ticket: HeldTicketRow) => void; onClose: () => void }) {
  const { confirm } = useDialog();
  const [tickets, setTickets] = useState<HeldTicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTickets(await listHeldTickets());
      setError(null);
    } catch (err) {
      setError(`Couldn't load the held tickets: ${errorMessage(err)}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function discard(ticket: HeldTicketRow) {
    const ok = await confirm({
      title: 'Throw away this held ticket?',
      message: `“${ticket.name}” (${heldItemsLabel(ticket.ticket)}) will be deleted.`,
      confirmLabel: 'Throw away',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await discardHeldTicket(ticket.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Held tickets">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Held tickets</h2>
        <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
          Close
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {tickets === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {tickets?.length === 0 && <p className="text-sm text-slate-500">No tickets are on hold.</p>}
      <ul className="divide-y divide-blue-100">
        {tickets?.map((ticket) => (
          <li key={ticket.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{ticket.name}</p>
              <p className="text-xs text-slate-500">
                {[
                  heldItemsLabel(ticket.ticket),
                  ticket.customers ? customerName(ticket.customers) : null,
                  `held ${heldAgo(ticket.held_at)}`,
                  staffLabel(ticket.held_by_staff) ? `by ${staffLabel(ticket.held_by_staff)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button
              onClick={() => onRecall(ticket)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Recall
            </button>
            <button onClick={() => void discard(ticket)} className="text-xs text-red-600 hover:underline">
              Throw away
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
