// Format a US phone number as the user types, to (xxx)xxx-xxxx, laying the
// digits out progressively so partial input stays sensible. A leading +1 or 1
// is the country code, never part of the area code (US area codes don't start
// with 1), so it's dropped. Anything that isn't a US number of up to 10 digits
// (an international "+44 …", or a number with an extension) is kept exactly as
// typed rather than cut short.
export function formatPhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+') && !trimmed.startsWith('+1')) return raw;
  const d = trimmed.replace(/\D/g, '').replace(/^1/, '');
  if (d.length > 10) return raw;
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)})${d.slice(3)}`;
  return `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
}
