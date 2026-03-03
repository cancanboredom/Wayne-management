import { useEffect, useState } from 'react';
import { getMotionTier } from './motionPolicy';
import type { MotionContext, MotionTier } from './types';

function getContext(): MotionContext {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      prefersReducedMotion: false,
      isTouch: false,
    };
  }

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
    maxTouchPoints?: number;
  };

  return {
    prefersReducedMotion: media.matches,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    saveData: Boolean(nav.connection?.saveData),
    isTouch: (nav.maxTouchPoints ?? 0) > 0,
  };
}

export function useMotionTier(): MotionTier {
  const [tier, setTier] = useState<MotionTier>(() => getMotionTier(getContext()));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setTier(getMotionTier(getContext()));

    media.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return tier;
}
