import { useRemoteConfig } from '@/hooks/useRemoteConfig';
import { useAuth } from '@/hooks/useAuth';
import { RemoteConfigCtx } from './RemoteConfig';

/**
 * Provides remote config (kill switch, announcements, feature flags, update
 * notices) to the whole app. Reads the signed-in user from AuthContext so the
 * presence heartbeat can report who is online — must render inside AuthProvider.
 */
export function RemoteConfigProvider({ children }) {
  const { user } = useAuth();
  const remote = useRemoteConfig({ user });
  return (
    <RemoteConfigCtx.Provider value={remote}>
      {children}
    </RemoteConfigCtx.Provider>
  );
}
