import { useAuth } from './AuthContext';

// Shown to a signed-in account that isn't approved staff (role 'pending'):
// the database gives it no access, so there is nothing else to show.
export function PendingApprovalPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Waiting for approval</h1>
        <p className="text-sm text-slate-600">
          {user?.email ? <span className="font-medium text-slate-800">{user.email}</span> : 'This account'} isn’t
          set up for staff access yet. Ask an admin to approve it on the Users screen, then sign in again.
        </p>
        <button
          onClick={() => void signOut()}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
