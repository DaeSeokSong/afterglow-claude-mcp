import { useCallback, useEffect, useState } from 'react';

const LS_KEY = 'afterglow.tweaks';

export type TweakState = Record<string, string>;

/**
 * Tiny localStorage-backed key/value state used by the floating Tweaks panel.
 * Loads from localStorage on first render, persists on every change.
 */
export function useTweaks<T extends TweakState>(
  defaults: T,
): [T, (key: keyof T, value: T[keyof T]) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<T>;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota errors */
    }
  }, [state]);

  const setTweak = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  return [state, setTweak];
}
