import { useEffect, useState, useRef } from 'react';
import { apiGet } from './api';
import { normalizeSlug, SlugCheckResult } from './slug';

export function useSlugCheck(input: string, debounceMs = 400) {
  const [state, setState] = useState<SlugCheckResult>({
    slug: '',
    available: false,
  });
  const [isChecking, setIsChecking] = useState(false);
  const lastChecked = useRef('');

  const normalized = normalizeSlug(input);

  useEffect(() => {
    if (!normalized || normalized.length < 3) {
      setState({ slug: normalized, available: false, reason: 'Mínimo 3 caracteres' });
      return;
    }
    if (lastChecked.current === normalized) return;

    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const res = await apiGet<SlugCheckResult>('/tenants/validate-slug', { slug: normalized });
        lastChecked.current = normalized;
        setState(res);
      } catch {
        setState({ slug: normalized, available: false, reason: 'Erro ao validar' });
      } finally {
        setIsChecking(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [normalized, debounceMs]);

  return { ...state, isChecking, normalized };
}
