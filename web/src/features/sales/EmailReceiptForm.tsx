import { useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { isValidEmail } from '../../lib/notificationOptIn';
import { emailReceipt, saveCustomerEmail } from '../../lib/emailReceipt';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Email a sale's receipt, prefilled with the customer's address. A new address
// can be kept on the customer's record.
export function EmailReceiptForm({
  saleId,
  customer,
  onSent,
  onCancel,
}: {
  saleId: string;
  customer: { id: string; email: string | null } | null;
  onSent: (notice: string) => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(customer?.email ?? '');
  const [saveToCustomer, setSaveToCustomer] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNewAddress = customer !== null && to.trim() !== '' && to.trim() !== (customer.email ?? '').trim();

  async function send() {
    if (!isValidEmail(to)) {
      setError('Enter a valid email address');
      return;
    }
    setSending(true);
    setError(null);
    try {
      let notice = await emailReceipt(saleId, to);
      if (customer && isNewAddress && saveToCustomer) {
        try {
          await saveCustomerEmail(customer.id, to);
        } catch (err) {
          notice += ` The address wasn't saved to the customer: ${errorMessage(err)}`;
        }
      }
      onSent(notice);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Email receipt</h2>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="customer@example.com"
        aria-label="Email address"
        inputMode="email"
        className={inputClass}
      />
      {isNewAddress && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={saveToCustomer} onChange={(e) => setSaveToCustomer(e.target.checked)} />
          Save this address to the customer
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void send()}
          disabled={sending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send receipt'}
        </button>
        <button onClick={onCancel} disabled={sending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}
