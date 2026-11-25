import { useBack } from '../../app/BackContext';
import { EmptyState } from '../../components/EmptyState';

// The owner's reports (admin only): each one for a period, with a CSV download.
export function ReportsPage() {
  useBack('/');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Reports</h1>
      <EmptyState title="No reports yet" message="Sales, margin, stock and service reports appear here." />
    </div>
  );
}
