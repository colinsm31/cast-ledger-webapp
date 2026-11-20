import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { pageRule } from '../../lib/receiptLayout';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { fetchJobTag, type JobTag } from './jobTag';
import { JobTagView } from './JobTagView';

// A string job's tag, ready to print on the 80 mm printer and put on the
// racquet. Outside the app's frame, so only the tag prints.
export function JobTagPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [tag, setTag] = useState<JobTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const startRequest = useLatestRequest();

  useEffect(() => {
    if (!jobId) return;
    const isLatest = startRequest();
    setError(null);
    fetchJobTag(jobId).then(
      (loaded) => {
        if (isLatest()) setTag(loaded);
      },
      (err: unknown) => {
        if (isLatest()) setError(errorMessage(err));
      },
    );
  }, [jobId, loadCount, startRequest]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{pageRule('thermal')}</style>
      <div className="mx-auto mb-4 flex max-w-md flex-wrap items-center gap-2 print:hidden">
        <Link to={`/string-jobs/${jobId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to the job
        </Link>
        <button
          onClick={() => window.print()}
          disabled={!tag}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Print tag
        </button>
      </div>
      {error ? (
        <div className="mx-auto max-w-md">
          <LoadError message={error} onRetry={() => setLoadCount((count) => count + 1)} />
        </div>
      ) : tag ? (
        <div className="mx-auto w-fit bg-white p-4 shadow print:p-0 print:shadow-none">
          <JobTagView tag={tag} />
        </div>
      ) : (
        <Spinner label="Loading the tag…" />
      )}
    </div>
  );
}
