import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Database } from 'sql.js';
import { progress } from '../progress/store';
import { loadSql, makeDb, sqlReady } from '../sql/engine';

export function useProgress() {
  return useSyncExternalStore(progress.subscribe, progress.getVersion, progress.getVersion);
}

/** A fresh SQLite database for a dataset (re-created when `nonce` changes). */
export function useDb(dataset: string | undefined, nonce = 0): Database | null {
  const [db, setDb] = useState<Database | null>(() => (dataset && sqlReady() ? makeDb(dataset) : null));
  useEffect(() => {
    if (!dataset) return;
    let live = true;
    let mine: Database | null = null;
    loadSql().then(() => {
      if (!live) return;
      mine = makeDb(dataset);
      setDb(mine);
    });
    return () => {
      live = false;
      // free the previous copy a moment later, after anything still rendering with it is done
      const old = mine;
      if (old) setTimeout(() => old.close(), 2000);
    };
  }, [dataset, nonce]);
  return db;
}

export function useSqlReady() {
  const [ready, setReady] = useState(sqlReady());
  useEffect(() => {
    if (!ready) loadSql().then(() => setReady(true));
  }, [ready]);
  return ready;
}
