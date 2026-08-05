import { Link } from 'react-router-dom';

// Temporary retail landing page. Real dashboard/product screens land in the next
// steps of the AceStock build.
export function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">AceStock</h1>
      <p className="text-sm text-slate-600">
        Tennis shop inventory. The retail schema is in place — product, stock, and
        sales screens are being built next.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard to="/products" label="Products" />
        <NavCard to="/sales/new" label="New sale" />
        <NavCard to="/sales" label="Sales" />
        <NavCard to="/categories" label="Categories" />
      </div>
    </div>
  );
}

function NavCard({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50"
    >
      {label}
    </Link>
  );
}
