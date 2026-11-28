import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDayClose } from '../../lib/dayCloses';
import { shopToday } from '../../lib/dayReport';

// A reminder at the register once today has been closed: sales, refunds and
// exchanges are refused until an admin reopens the day.
export function DayClosedNotice({ timeZone }: { timeZone: string | null }) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!timeZone) return;
    let active = true;
    fetchDayClose(shopToday(timeZone)).then(
      (close) => {
        if (active) setClosed(close !== null);
      },
      () => {
        // The server refuses money on a closed day either way; this is only a reminder.
      },
    );
    return () => {
      active = false;
    };
  }, [timeZone]);

  if (!closed) return null;
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      Today has been closed, so sales, refunds and exchanges can&apos;t be rung. An admin can reopen it on the{' '}
      <Link to="/end-of-day" className="font-semibold underline">
        End of Day screen
      </Link>
      .
    </p>
  );
}
