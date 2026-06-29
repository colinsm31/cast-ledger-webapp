import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

// Wraps a traceability document: a title block, Back + Print controls (hidden
// when printing), and a printable body. Print styling lives in index.css under
// the `.trace-document` / `@media print` rules.

export function TraceLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="trace-document mx-auto max-w-3xl">
      {/* Controls — not printed */}
      <div className="trace-controls mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Printable document */}
      <div className="trace-sheet rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="mb-6 border-b-2 border-slate-800 pb-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold tracking-tight text-slate-900">CastLedger</span>
            <span className="text-xs text-slate-500">Traceability package</span>
          </div>
          <h1 className="mt-2 text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
          <p className="mt-1 text-xs text-slate-400">
            Generated {new Date().toLocaleString()}
          </p>
        </header>

        {children}
      </div>
    </div>
  );
}
