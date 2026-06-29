import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SignInPage } from './auth/SignInPage';
import { AppShell } from './app/AppShell';
import { Spinner } from './components/Spinner';
import { isSupabaseConfigured } from './lib/supabase';
import { TemplateListPage } from './features/templates/TemplateListPage';
import { TemplateDefinerPage } from './features/templates/TemplateDefinerPage';
import { PieceFamilyPickerPage } from './features/pieces/PieceFamilyPickerPage';
import { PieceEditorPage } from './features/pieces/PieceEditorPage';
import { PiecesListPage } from './features/pieces/PiecesListPage';
import { PieceDetailPage } from './features/pieces/PieceDetailPage';
import { ProjectsListPage } from './features/projects/ProjectsListPage';
import { CreateProjectPage } from './features/projects/CreateProjectPage';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage';
import { PieceTracePage } from './features/traceability/PieceTracePage';
import { ProjectTracePage } from './features/traceability/ProjectTracePage';

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

function Gate() {
  const { loading, session } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!session) return <SignInPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/families" replace />} />
        <Route path="/families" element={<TemplateListPage />} />
        <Route path="/families/new" element={<TemplateDefinerPage />} />
        <Route path="/pieces" element={<PiecesListPage />} />
        <Route path="/pieces/new" element={<PieceFamilyPickerPage />} />
        <Route path="/pieces/new/:designId" element={<PieceEditorPage />} />
        <Route path="/pieces/:pieceId" element={<PieceDetailPage />} />
        <Route path="/pieces/:pieceId/trace" element={<PieceTracePage />} />
        <Route path="/projects" element={<ProjectsListPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/trace" element={<ProjectTracePage />} />
        <Route path="*" element={<Navigate to="/families" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />;
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
