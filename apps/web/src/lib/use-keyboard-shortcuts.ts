import { useEffect } from 'react';

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/** Elementos onde atalhos de tecla simples não devem disparar (usuário está digitando). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(map: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || '').toUpperCase();
      const action = map[key] || map[e.key];
      if (!action) return;

      // Ignora atalhos de tecla simples (sem modificador) quando o foco está
      // em um campo editável — antes isso bloqueava a digitação em formulários.
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (!hasModifier && isEditableTarget(e.target)) return;

      e.preventDefault();
      action(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [map, enabled]);
}
