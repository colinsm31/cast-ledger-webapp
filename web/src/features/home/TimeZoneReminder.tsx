import { Link } from 'react-router-dom';
import { useSettings } from '../../lib/settings';

// For admins: cash drawers and the end-of-day close start once the shop's time
// zone is set in Settings (until then cash is taken in no drawer, 0114).
export function TimeZoneReminder() {
  const { settings } = useSettings();
  if (!settings || settings.time_zone) return null;
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      Set the shop&apos;s time zone in{' '}
      <Link to="/settings" className="font-semibold underline">
        Settings
      </Link>{' '}
      to start using cash drawers and the end-of-day close.
    </p>
  );
}
