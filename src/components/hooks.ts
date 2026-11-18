import { useSyncExternalStore } from 'react';
import { progress } from '../progress/progress';

export function useProgress() {
  return useSyncExternalStore(progress.subscribe, progress.getVersion, progress.getVersion);
}
