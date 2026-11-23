import { useEffect, useState } from 'react';
import type { ThemePreference } from '../../shared/types';

export type ResolvedTheme = 'light' | 'dark';

export function useTheme(preference: ThemePreference): ResolvedTheme {
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    try {
      localStorage.setItem('macnotes.theme', preference);
    } catch {
      // Theme caching is only used to avoid a flash on the next launch.
    }
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  return resolved;
}
