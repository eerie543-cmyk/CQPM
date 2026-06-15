import { useContext } from 'react';
import { RemoteConfigCtx } from '@/contexts/RemoteConfig';

export function useRemoteConfigContext() {
  const ctx = useContext(RemoteConfigCtx);
  if (!ctx) throw new Error('useRemoteConfigContext must be used inside RemoteConfigProvider');
  return ctx;
}
