import { useSyncExternalStore } from 'react';
import type { AppStore } from './store';

/** Re-render when the store changes. Returns the version so callers can memo on it. */
export function useStore(s: AppStore): number {
  return useSyncExternalStore(s.subscribe, s.getVersion, s.getVersion);
}
