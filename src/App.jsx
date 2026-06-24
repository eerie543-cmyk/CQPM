import { useState, useEffect, useMemo } from 'react';
import { WifiOff } from 'lucide-react';
import { AuthProvider } from './contexts/AuthContext';
import { RemoteConfigProvider } from './contexts/RemoteConfigContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ToastProvider';
import { useAuth } from './hooks/useAuth';
import { useRemoteConfigContext } from './hooks/useRemoteConfigContext';
import { useDbHealth } from './hooks/useDbHealth';
import { useInactivityLogout } from './hooks/useInactivityLogout';
import Login from './components/Login';
import ChangePasswordModal from './components/ChangePasswordModal';
import SessionWarning from './components/SessionWarning';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import TodayPage from './pages/TodayPage';
import MatrixPage from './pages/MatrixPage';
import ParametersPage from './pages/ParametersPage';
import ApprovalsPage from './pages/ApprovalsPage';
import SettingsPage from './pages/SettingsPage';
import UsersPanel from './components/UsersPanel';
import LockScreen from './components/LockScreen';
import AnnouncementBanner from './components/AnnouncementBanner';
import UpdateBanner from './components/UpdateBanner';

const ALL_DEPTS = ['serology', 'molecularBio', 'microbiology'];

function ConnectionBanner() {
  const online = useDbHealth();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs bg-destructive/15 text-destructive border-b border-destructive/30 flex-shrink-0">
      <WifiOff className="w-3.5 h-3.5" />
      Can’t reach the database — changes won’t save until the connection is back.
    </div>
  );
}

function AppShell() {
  const { isAuthenticated, user, isAdmin, mustChangePassword, logout } = useAuth();
  const { isLocked, lockMessage, announcement, updateInfo, departments, features } = useRemoteConfigContext();
  useInactivityLogout(logout, isAuthenticated);
  const [page, setPage] = useState('today');
  const [pendingParamRequests, setPendingParamRequests] = useState(0);

  // Admins see all remote-enabled depts; staff only see their own.
  const visibleDepts = useMemo(() => {
    const remote = ALL_DEPTS.filter(d => departments[d] !== false);
    if (!isAdmin && user?.department) return remote.filter(d => d === user.department);
    return remote;
  }, [departments.serology, departments.molecularBio, departments.microbiology, isAdmin, user?.department]);

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
  // 'parameters' is now accessible by staff (they see Request Parameter button, not Add).
  const adminPages = ['approvals', 'users'];
  let activePage = page;
  if (adminPages.includes(activePage) && !adminEnabled) activePage = 'today';
  if (activePage === 'matrix'   && !matrixEnabled)      activePage = 'today';

  const noDept = (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      No departments are currently available. Please contact your administrator.
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <ConnectionBanner />
      <div className="flex flex-1 min-h-0">
      <Sidebar
        page={activePage}
        onPage={setPage}
        activeDept={activeDept}
        onDept={isAdmin ? setActiveDept : undefined}
        isAdmin={adminEnabled}
        matrixEnabled={matrixEnabled}
        user={user}
        visibleDepts={visibleDepts}
        pendingParamRequests={adminEnabled ? pendingParamRequests : 0}
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
        {activePage === 'approvals'  && <ApprovalsPage onParamReqChange={setPendingParamRequests} />}
        {activePage === 'settings'   && <SettingsPage />}
        {activePage === 'today'      && (activeDept ? <TodayPage  dept={activeDept} /> : noDept)}
        {activePage === 'matrix'     && (activeDept ? <MatrixPage dept={activeDept} /> : noDept)}
        {activePage === 'users'      && <UsersPanel />}
      </main>
      </div>
      <SessionWarning />

      {/* Forced password change on first login — blocks the app until resolved. */}
      {mustChangePassword && <ChangePasswordModal />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
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
      </ToastProvider>
    </ThemeProvider>
  );
}
