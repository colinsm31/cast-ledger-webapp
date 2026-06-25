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
            <span className="font-bold text-slate-900">CastLedger</span>
            <nav className="flex gap-1">
              <NavLink to="/families" className={navLinkClass}>
                Product families
              </NavLink>
              <NavLink to="/pieces/new" className={navLinkClass}>
                New piece
              </NavLink>
              <NavLink to="/pieces" end className={navLinkClass}>
                Pieces
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
