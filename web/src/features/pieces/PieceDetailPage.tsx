import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type {
  JsonValue,
  PieceWithDesign,
  Project,
  QCTest,
  QCTestType,
} from '../../types/domain';
import { nextPieceStatus } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { StatusBadge, statusLabel } from './StatusBadge';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

const TEST_TYPES: { value: QCTestType; label: string }[] = [
  { value: 'break_7day', label: 'Break — 7 day' },
  { value: 'break_28day', label: 'Break — 28 day' },
  { value: 'water_test', label: 'Water test' },
  { value: 'other', label: 'Other' },
];

function displayValue(value: JsonValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return '{…}';
  return String(value);
}

function testTypeLabel(type: QCTestType): string {
  return TEST_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function PieceDetailPage() {
  const { pieceId } = useParams<{ pieceId: string }>();
  const [piece, setPiece] = useState<PieceWithDesign | null>(null);
  const [tests, setTests] = useState<QCTest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pieceId) return;
    const [pieceRes, testsRes] = await Promise.all([
      supabase.from('pieces').select(SELECT).eq('id', pieceId).single(),
      supabase
        .from('qc_tests')
        .select('*')
        .eq('piece_id', pieceId)
        .order('tested_at', { ascending: false }),
    ]);
    if (pieceRes.error) setError(errorMessage(pieceRes.error));
    else {
      setPiece(pieceRes.data as unknown as PieceWithDesign);
      setTests((testsRes.data ?? []) as QCTest[]);
    }
  }, [pieceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!piece) return <Spinner label="Loading…" />;

  const specEntries = Object.entries(piece.spec_values ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">{piece.mark_no}</h1>
          <StatusBadge status={piece.status} />
        </div>
        <Link
          to={`/pieces/${piece.id}/trace`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Traceability
        </Link>
      </div>

      <StatusSection piece={piece} onChanged={load} />

      <ProjectSection piece={piece} onChanged={load} />

      <Section title="Piece">
        <Row label="Mark" value={piece.mark_no} />
        {piece.weight_lb != null && <Row label="Weight" value={`${piece.weight_lb} lb`} />}
        {piece.yard_location && <Row label="Yard location" value={piece.yard_location} />}
      </Section>

      <Section title="Design">
        <Row label="Family" value={piece.product_designs?.family ?? '—'} />
        <Row label="Name" value={piece.product_designs?.name ?? '—'} />
        {piece.product_designs?.drawing_no && (
          <Row label="Drawing" value={piece.product_designs.drawing_no} />
        )}
        <Row label="As-poured revision" value={`rev ${piece.product_design_revision}`} />
      </Section>

      <Section title="Specs">
        {specEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No spec values recorded.</p>
        ) : (
          specEntries.map(([key, value]) => (
            <Row key={key} label={key} value={displayValue(value)} />
          ))
        )}
      </Section>

      <QCSection pieceId={piece.id} tests={tests} onRecorded={load} />
    </div>
  );
}

// MARK: - Status advancement

function StatusSection({
  piece,
  onChanged,
}: {
  piece: PieceWithDesign;
  onChanged: () => Promise<void>;
}) {
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextPieceStatus(piece.status);

  async function advance() {
    if (!next) return;
    setAdvancing(true);
    setError(null);
    const { error: err } = await supabase.rpc('advance_piece_status', {
      p_piece_id: piece.id,
      p_target_status: next,
    });
    setAdvancing(false);
    if (err) setError(errorMessage(err));
    else await onChanged();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Status</h2>
        <StatusBadge status={piece.status} />
      </div>
      {next ? (
        <button
          onClick={() => void advance()}
          disabled={advancing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {advancing ? 'Advancing…' : `Move to ${statusLabel(next)}`}
        </button>
      ) : (
        <p className="text-sm text-slate-500">This piece is at the final status.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

// MARK: - Project assignment

function ProjectSection({
  piece,
  onChanged,
}: {
  piece: PieceWithDesign;
  onChanged: () => Promise<void>;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('projects').select('*').order('job_number');
      setProjects((data ?? []) as Project[]);
    })();
  }, []);

  async function assign(projectId: string) {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('pieces')
      .update({ project_id: projectId || null })
      .eq('id', piece.id);
    setSaving(false);
    if (err) setError(errorMessage(err));
    else await onChanged();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">Project</h2>
      <select
        value={piece.project_id ?? ''}
        disabled={saving}
        onChange={(e) => void assign(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.job_number} — {project.name}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

// MARK: - QC tests

function QCSection({
  pieceId,
  tests,
  onRecorded,
}: {
  pieceId: string;
  tests: QCTest[];
  onRecorded: () => Promise<void>;
}) {
  const [testType, setTestType] = useState<QCTestType>('break_28day');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('psi');
  const [pass, setPass] = useState<'pass' | 'fail'>('pass');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    if (value && Number.isNaN(Number(value))) {
      setError('Value must be a number');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('record_qc_test', {
      p_piece_id: pieceId,
      p_test_type: testType,
      p_value: value ? Number(value) : null,
      p_unit: unit.trim() || null,
      p_pass: pass === 'pass',
      p_tested_by: null,
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setValue('');
    await onRecorded();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">QC tests</h2>

      {tests.length === 0 ? (
        <p className="text-sm text-slate-500">No QC tests recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tests.map((test) => (
            <li key={test.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-slate-800">{testTypeLabel(test.test_type)}</span>
                {test.value != null && (
                  <span className="text-slate-500">
                    {' '}
                    · {test.value}
                    {test.unit ? ` ${test.unit}` : ''}
                  </span>
                )}
              </div>
              {test.pass === true ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                  Pass
                </span>
              ) : test.pass === false ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  Fail
                </span>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-500">Record a test</p>
        <div className="flex flex-wrap gap-2">
          <select
            value={testType}
            onChange={(e) => setTestType(e.target.value as QCTestType)}
            className={inputClass}
          >
            {TEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${inputClass} w-24`}
          />
          <input
            placeholder="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={`${inputClass} w-20`}
          />
          <select
            value={pass}
            onChange={(e) => setPass(e.target.value as 'pass' | 'fail')}
            className={inputClass}
          >
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
          <button
            onClick={() => void record()}
            disabled={saving}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add test'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}

// MARK: - Small layout helpers

const inputClass =
  'rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

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
