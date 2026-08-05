import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium ${
    isActive ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-100'
  }`;

export function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <NavLink to="/" className="font-bold text-slate-900 hover:text-blue-700">
              AceStock
            </NavLink>
            <nav className="flex gap-1">
              <NavLink to="/products" className={navLinkClass}>
                Products
              </NavLink>
              <NavLink to="/sales/new" className={navLinkClass}>
                New sale
              </NavLink>
              <NavLink to="/sales" end className={navLinkClass}>
                Sales
              </NavLink>
              <NavLink to="/categories" className={navLinkClass}>
                Categories
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 hidden sm:inline">{user?.email}</span>
            <button
              onClick={() => void signOut()}
              className="text-sm text-slate-600 hover:text-red-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
