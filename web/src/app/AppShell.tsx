import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBackTarget } from './BackContext';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium ${
    isActive ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-100'
  }`;

// Show a striped bar only on the test build (set VITE_APP_ENV=test in that
// environment's .env). Production leaves the var unset → plain white navbar.
const isTestEnv = import.meta.env.VITE_APP_ENV === 'test';
const testStripe = {
  backgroundImage:
    'repeating-linear-gradient(45deg, #fef3c7, #fef3c7 12px, #fde68a 12px, #fde68a 24px)',
};

export function AppShell() {
  const { signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const backTarget = useBackTarget();
  const showBack = location.pathname !== '/';

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className={`border-b ${isTestEnv ? 'border-amber-300' : 'bg-white border-slate-200'}`}
        style={isTestEnv ? testStripe : undefined}
      >
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <NavLink to="/" className="font-bold text-slate-900 hover:text-blue-700">
              AceStock
            </NavLink>
            {isTestEnv && (
              <span className="rounded-full bg-amber-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-50">
                Test
              </span>
            )}
            <nav className="flex gap-1">
              <NavLink to="/sales/new" className={navLinkClass}>
                New Sale
              </NavLink>
              <NavLink to="/sales" end className={navLinkClass}>
                Sales
              </NavLink>
              <NavLink to="/products" className={navLinkClass}>
                Products
              </NavLink>
              <NavLink to="/string-jobs/open" className={navLinkClass}>
                Open Re-Strings
              </NavLink>
              <NavLink to="/string-jobs/completed" className={navLinkClass}>
                Completed Re-Strings
              </NavLink>
              {isAdmin && (
                <NavLink to="/settings" className={navLinkClass}>
                  Settings
                </NavLink>
              )}
            </nav>
          </div>
          <button
            onClick={() => void signOut()}
            className="text-sm text-slate-600 hover:text-red-600"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {showBack && (
          <button
            onClick={() => (backTarget ? navigate(backTarget) : navigate(-1))}
            className="mb-4 flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-blue-700"
          >
            <span aria-hidden>‹</span> Back
          </button>
        )}
        <Outlet />
      </main>
    </div>
  );
}
