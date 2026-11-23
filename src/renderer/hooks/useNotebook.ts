import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotebookData, SaveResult } from '../../shared/types';
import { api } from '../lib/api';
import { normalizeData } from '../lib/data';
import { createSeedData } from '../lib/seed';

export type SaveState = 'saved' | 'saving' | 'error';

export interface NotebookController {
  data: NotebookData | null;
  ready: boolean;
  loadError: string | null;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  dataPath: string;
  version: string;
  mutate: (updater: (previous: NotebookData) => NotebookData) => void;
}

export function useNotebook(): NotebookController {
  const [data, setData] = useState<NotebookData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [dataPath, setDataPath] = useState('');
  const [version, setVersion] = useState('1.0.1');

  const dataRef = useRef<NotebookData | null>(null);
  const saveSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.load();
        if (cancelled) return;
        const initial = result.data ? normalizeData(result.data) : createSeedData();
        setDataPath(result.dataPath);
        setVersion(result.version);
        setData(initial);
        setReady(true);
      } catch (error) {
        console.error('[macnotes] Failed to load notebook', error);
        if (!cancelled) {
          setLoadError('无法读取本地备忘录，请检查数据目录权限。');
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const mutate = useCallback((updater: (previous: NotebookData) => NotebookData) => {
    setData((previous) => (previous ? updater(previous) : previous));
  }, []);

  useEffect(() => {
    if (!ready || !data) return;
    const sequence = ++saveSequence.current;
    setSaveState('saving');
    setSaveError(null);

    const timer = window.setTimeout(() => {
      void api
        .save(data)
        .then((result: SaveResult) => {
          if (sequence !== saveSequence.current) return;
          if (result.ok) {
            setSaveState('saved');
            setLastSavedAt(result.savedAt ?? Date.now());
          } else {
            setSaveState('error');
            setSaveError(result.error ?? '保存失败');
          }
        })
        .catch((error: unknown) => {
          if (sequence !== saveSequence.current) return;
          console.error('[macnotes] Failed to save notebook', error);
          setSaveState('error');
          setSaveError('保存失败');
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data, ready]);

  useEffect(() => {
    const flushLatest = () => {
      if (dataRef.current) api.flush(dataRef.current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushLatest();
    };
    window.addEventListener('beforeunload', flushLatest);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushLatest);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return {
    data,
    ready,
    loadError,
    saveState,
    saveError,
    lastSavedAt,
    dataPath,
    version,
    mutate,
  };
}
