import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { JsonValue, PieceWithDesign } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from './StatusBadge';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

function displayValue(value: JsonValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return '{…}';
  return String(value);
}

export function PieceDetailPage() {
  const { pieceId } = useParams<{ pieceId: string }>();
  const [piece, setPiece] = useState<PieceWithDesign | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pieceId) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('pieces')
        .select(SELECT)
        .eq('id', pieceId)
        .single();
      if (err) setError(errorMessage(err));
      else setPiece(data as unknown as PieceWithDesign);
    })();
  }, [pieceId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!piece) return <Spinner label="Loading…" />;

  const specEntries = Object.entries(piece.spec_values ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">{piece.mark_no}</h1>
        <StatusBadge status={piece.status} />
      </div>

      <Section title="Piece">
        <Row label="Mark" value={piece.mark_no} />
        {piece.weight_lb != null && <Row label="Weight" value={`${piece.weight_lb} lb`} />}
        {piece.yard_location && <Row label="Yard location" value={piece.yard_location} />}
      </Section>

      <Section title="Design">
        <Row label="Family" value={piece.product_designs?.family ?? '—'} />
        <Row label="Name" value={piece.product_designs?.name ?? '—'} />
        {piece.product_designs?.drawing_no && <Row label="Drawing" value={piece.product_designs.drawing_no} />}
        <Row label="As-poured revision" value={`rev ${piece.product_design_revision}`} />
      </Section>

      <Section title="Specs">
        {specEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No spec values recorded.</p>
        ) : (
          specEntries.map(([key, value]) => <Row key={key} label={key} value={displayValue(value)} />)
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <dl className="divide-y divide-slate-100">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right">{value}</dd>
    </div>
  );
}
