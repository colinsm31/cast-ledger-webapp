import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Category } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface CategoryRow extends Category {
  attribute_defs: { count: number }[];
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    // Embed a count of attribute_defs per category via PostgREST aggregate.
    const { data, error: err } = await supabase
      .from('categories')
      .select('*, attribute_defs(count)')
      .order('sort_order')
      .order('name');
    if (err) setError(errorMessage(err));
    else setCategories((data ?? []) as unknown as CategoryRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('categories').insert({ name });
    setSaving(false);
    if (err) {
      setError(
        errorMessage(err).includes('duplicate')
          ? 'A category with that name already exists.'
          : errorMessage(err),
      );
      return;
    }
    setNewName('');
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Categories</h1>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addCategory();
          }}
          placeholder="New category name (e.g. Rackets)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => void addCategory()}
          disabled={saving || !newName.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {categories === null && !error && <Spinner label="Loading…" />}
      {categories && categories.length === 0 && (
        <EmptyState title="No categories yet" message="Add a product category to define its attributes." />
      )}
      {categories && categories.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                to={`/categories/${category.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{category.name}</span>
                <span className="text-sm text-slate-500">
                  {category.attribute_defs?.[0]?.count ?? 0} attributes
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
