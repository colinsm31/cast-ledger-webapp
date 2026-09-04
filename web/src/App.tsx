import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SignInPage } from './auth/SignInPage';
import { AppShell } from './app/AppShell';
import { Spinner } from './components/Spinner';
import { DialogProvider } from './components/Dialog';
import { BackProvider } from './app/BackContext';
import { isSupabaseConfigured } from './lib/supabase';
import { HomePage } from './features/home/HomePage';
import { NewSalePage } from './features/sales/NewSalePage';
import { SalesListPage } from './features/sales/SalesListPage';
import { SaleDetailPage } from './features/sales/SaleDetailPage';
import { RefundPage } from './features/sales/RefundPage';
import { GiftCardLookupPage } from './features/sales/GiftCardLookupPage';
import { UsersPage } from './features/admin/UsersPage';
import { SettingsPage } from './features/admin/SettingsPage';
import { SettingsLayout } from './features/admin/SettingsLayout';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { CategoryDetailPage } from './features/categories/CategoryDetailPage';
import { ProductsListPage } from './features/products/ProductsListPage';
import { ProductFormPage } from './features/products/ProductFormPage';
import { ProductDetailPage } from './features/products/ProductDetailPage';
import { CustomersListPage } from './features/customers/CustomersListPage';
import { CreateCustomerPage } from './features/customers/CreateCustomerPage';
import { CustomerDetailPage } from './features/customers/CustomerDetailPage';
import { NewStringJobPage } from './features/customers/NewStringJobPage';
import { StringJobsPage } from './features/stringjobs/StringJobsPage';
import { StringJobDetailPage } from './features/stringjobs/StringJobDetailPage';

function SetupNeeded() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-bold text-slate-900">Setup needed</h1>
        <p className="text-sm text-slate-600">
          Copy <code className="bg-slate-100 px-1 rounded">.env.example</code> to{' '}
          <code className="bg-slate-100 px-1 rounded">.env.local</code> and fill in your
          Supabase URL and anon key, then restart the dev server.
        </p>
      </div>
    </div>
  );
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, role, isAdmin } = useAuth();
  // Wait for the role to load before deciding.
  if (session && role === null) return <Spinner label="Loading…" />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Gate() {
  const { loading, session } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!session) return <SignInPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        {/* Retail screens — filled in over the next build steps. */}
        <Route path="/products" element={<ProductsListPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/products/:productId" element={<ProductDetailPage />} />
        <Route path="/products/:productId/edit" element={<ProductFormPage />} />
        <Route path="/sales" element={<SalesListPage />} />
        <Route path="/sales/new" element={<NewSalePage />} />
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
        <Route path="/sales/:saleId/refund" element={<RefundPage />} />
        <Route path="/gift-cards" element={<GiftCardLookupPage />} />
        <Route element={<RequireAdmin><SettingsLayout /></RequireAdmin>}>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/categories/:categoryId" element={<CategoryDetailPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Route>
        <Route path="/customers" element={<CustomersListPage />} />
        <Route path="/customers/new" element={<CreateCustomerPage />} />
        <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
        <Route path="/customers/:customerId/rackets/:racketId/restring" element={<NewStringJobPage />} />
        <Route path="/string-jobs" element={<Navigate to="/string-jobs/open" replace />} />
        <Route path="/string-jobs/open" element={<StringJobsPage status="entered" title="Open Re-Strings" />} />
        <Route path="/string-jobs/completed" element={<StringJobsPage status="complete" title="Completed Re-Strings" />} />
        <Route path="/string-jobs/:jobId" element={<StringJobDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />;
  return (
    <BrowserRouter>
      <AuthProvider>
        <DialogProvider>
          <BackProvider>
            <Gate />
          </BackProvider>
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
