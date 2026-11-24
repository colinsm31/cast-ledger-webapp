import { OPT_IN_WORDING, optInProblem, type NotificationChannel, type OptInState } from '../../lib/notificationOptIn';

// The two opt-in boxes on the customer forms (0085). A box can only be ticked
// once its email or number is usable; staff read the wording to the customer.
// After the address or number changes (askAgain), its box starts unticked:
// the customer's consent was for the old one (0089).
export function NotificationOptInFields({
  value,
  email,
  phone,
  onChange,
  askAgain = {},
}: {
  value: OptInState;
  email: string;
  phone: string;
  onChange: (value: OptInState) => void;
  askAgain?: Partial<Record<NotificationChannel, boolean>>;
}) {
  const rows: { channel: NotificationChannel; key: keyof OptInState; contact: string }[] = [
    { channel: 'email', key: 'email_opt_in', contact: email },
    { channel: 'sms', key: 'sms_opt_in', contact: phone },
  ];
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-slate-500">Ready messages (ask the customer)</legend>
      {rows.map(({ channel, key, contact }) => {
        const problem = optInProblem(channel, contact);
        const checked = value[key] && !problem;
        return (
          <div key={channel}>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={checked}
                disabled={problem !== null}
                onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              />
              {OPT_IN_WORDING[channel]}
            </label>
            {problem && contact.trim() !== '' && <p className="ml-6 text-xs text-amber-700">{problem}</p>}
            {!problem && askAgain[channel] && !value[key] && (
              <p className="ml-6 text-xs text-amber-700">
                {channel === 'email' ? 'New email address' : 'New mobile number'}: ask the customer again before ticking
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
