import { useState, useEffect, useMemo } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { RemoteConfigProvider } from './contexts/RemoteConfigContext';
import { useAuth } from './hooks/useAuth';
import { useRemoteConfigContext } from './hooks/useRemoteConfigContext';
import Login from './components/Login';
import ChangePasswordModal from './components/ChangePasswordModal';
import SessionWarning from './components/SessionWarning';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import TodayPage from './pages/TodayPage';
import MatrixPage from './pages/MatrixPage';
import ParametersPage from './pages/ParametersPage';
import ApprovalsPage from './pages/ApprovalsPage';
import LockScreen from './components/LockScreen';
import AnnouncementBanner from './components/AnnouncementBanner';
import UpdateBanner from './components/UpdateBanner';

const ALL_DEPTS = ['serology', 'molecularBio', 'microbiology'];

function AppShell() {
  const { isAuthenticated, user, isAdmin, mustChangePassword } = useAuth();
  const { isLocked, lockMessage, announcement, updateInfo, departments, features } = useRemoteConfigContext();
  const [page, setPage] = useState('today');

  // Departments hidden remotely drop out of the switcher and routing.
  const visibleDepts = useMemo(
    () => ALL_DEPTS.filter(d => departments[d] !== false),
    [departments.serology, departments.molecularBio, departments.microbiology],
  );

  const [activeDept, setActiveDept] = useState(user?.department ?? 'serology');

  // Keep the active department valid as remote visibility changes.
  useEffect(() => {
    if (!visibleDepts.includes(activeDept)) setActiveDept(visibleDepts[0] ?? null);
  }, [visibleDepts, activeDept]);

  // Remote kill switch — precedes auth, shown to everyone (fills the area below the title bar).
  if (isLocked) return <LockScreen message={lockMessage} />;

  if (!isAuthenticated) return <Login />;

  // The in-app admin surface can be switched off remotely, even for admins.
  const adminEnabled  = isAdmin && features.adminPanel !== false;
  const matrixEnabled = features.matrix !== false;
  const showBanners   = announcement.active || updateInfo.needed;

  // Pages can be switched off remotely; fall back to Today if the current one is unavailable.
  const adminPages = ['parameters', 'approvals'];
  let activePage = page;
  if (adminPages.includes(activePage) && !adminEnabled) activePage = 'today';
  if (activePage === 'matrix' && !matrixEnabled)        activePage = 'today';

  const noDept = (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      No departments are currently available. Please contact your administrator.
    </div>
  );

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      <Sidebar
        page={activePage}
        onPage={setPage}
        activeDept={activeDept}
        onDept={isAdmin ? setActiveDept : undefined}
        isAdmin={adminEnabled}
        matrixEnabled={matrixEnabled}
        user={user}
        visibleDepts={visibleDepts}
      />
      <main className="flex-1 overflow-auto">
        {showBanners && (
          <div className="flex flex-col gap-2 px-6 pt-4">
            {announcement.active && (
              <AnnouncementBanner title={announcement.title} body={announcement.body} kind={announcement.kind} />
            )}
            {updateInfo.needed && (
              <UpdateBanner version={updateInfo.version} notes={updateInfo.notes} url={updateInfo.url} />
            )}
          </div>
        )}

        {activePage === 'parameters' && <ParametersPage dept={activeDept} />}
        {activePage === 'approvals'  && <ApprovalsPage />}
        {activePage === 'today'      && (activeDept ? <TodayPage  dept={activeDept} /> : noDept)}
        {activePage === 'matrix'     && (activeDept ? <MatrixPage dept={activeDept} /> : noDept)}
      </main>
      <SessionWarning />

      {/* Forced password change on first login — blocks the app until resolved. */}
      {mustChangePassword && <ChangePasswordModal />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RemoteConfigProvider>
        <div className="flex flex-col h-screen">
          <TitleBar />
          <div className="relative min-h-0 flex-1">
            <AppShell />
          </div>
        </div>
      </RemoteConfigProvider>
    </AuthProvider>
  );
}
