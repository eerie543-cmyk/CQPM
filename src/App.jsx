import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import SessionWarning from './components/SessionWarning';
import Sidebar from './components/Sidebar';
import MatrixPage from './pages/MatrixPage';
import ParametersPage from './pages/ParametersPage';
import UsersPage from './pages/UsersPage';

function AppShell() {
  const { isAuthenticated, user, isAdmin } = useAuth();
  const [page, setPage]               = useState('matrix');
  const [activeDept, setActiveDept]   = useState(user?.department ?? 'serology');

  if (!isAuthenticated) return <Login />;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        page={page}
        onPage={setPage}
        activeDept={activeDept}
        onDept={isAdmin ? setActiveDept : undefined}
        isAdmin={isAdmin}
        user={user}
      />
      <main className="flex-1 overflow-auto">
        {page === 'matrix'     && <MatrixPage     dept={activeDept} />}
        {page === 'parameters' && <ParametersPage dept={activeDept} />}
        {page === 'users'      && isAdmin          && <UsersPage />}
      </main>
      <SessionWarning />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
