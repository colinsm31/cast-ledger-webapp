import type { SettingsForm } from '../../lib/settings';
import {
  READY_PLACEHOLDERS,
  renderTemplate,
  SAMPLE_READY_VALUES,
  smsSegments,
  unknownPlaceholders,
} from '../../lib/notifications';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// The "stringing ready" templates in Settings (0086), with a preview filled
// from example values and the shop's name as typed above.
export function ReadyTemplateFields({
  subject,
  emailBody,
  smsBody,
  shopName,
  onChange,
}: {
  subject: string;
  emailBody: string;
  smsBody: string;
  shopName: string;
  onChange: (changes: Partial<SettingsForm>) => void;
}) {
  const values = { ...SAMPLE_READY_VALUES, shop_name: shopName.trim() || 'the shop' };
  const unknown = unknownPlaceholders(`${subject} ${emailBody} ${smsBody}`);
  const previewText = renderTemplate(smsBody, values);
  const segments = smsSegments(previewText);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Ready messages</h2>
      <p className="text-xs text-slate-400">
        Sent when a string job is marked complete, to customers who opted in. You can use{' '}
        {READY_PLACEHOLDERS.map((name) => `{${name}}`).join(', ')}.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Email subject</span>
        <input value={subject} onChange={(e) => onChange({ readyEmailSubject: e.target.value })} className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Email</span>
        <textarea value={emailBody} onChange={(e) => onChange({ readyEmailBody: e.target.value })} rows={5} className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Text message</span>
        <textarea value={smsBody} onChange={(e) => onChange({ readySmsBody: e.target.value })} rows={3} className={inputClass} />
      </label>
      {unknown.length > 0 && (
        <p className="text-xs text-amber-700">
          Not a placeholder, so it's sent as typed: {unknown.map((name) => `{${name}}`).join(', ')}
        </p>
      )}
      <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Preview</p>
        <p>
          <span className="font-medium">Subject:</span> {renderTemplate(subject, values)}
        </p>
        <p className="whitespace-pre-line">{renderTemplate(emailBody, values)}</p>
        <p className="border-t border-slate-200 pt-1">
          <span className="font-medium">Text:</span> {previewText}{' '}
          <span className="text-slate-400">
            ({previewText.length} characters{segments > 1 ? `, sent as ${segments} texts` : ''})
          </span>
        </p>
      </div>
    </section>
  );
}
