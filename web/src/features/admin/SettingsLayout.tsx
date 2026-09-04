import { NavLink, Outlet } from 'react-router-dom';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
    isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
  }`;

// Wraps the admin section (settings, categories, users) with a shared sub-nav.
export function SettingsLayout() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200">
        <NavLink to="/settings" end className={tabClass}>
          Settings
        </NavLink>
        <NavLink to="/categories" className={tabClass}>
          Categories
        </NavLink>
        <NavLink to="/users" className={tabClass}>
          Users
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
