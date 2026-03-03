import type gsap from 'gsap';
import type { MotionContext, MotionProfile, MotionTier } from './types';

const DURATIONS: Record<MotionProfile, number> = {
  reveal: 0.72,
  modal: 0.3,
  banner: 0.2,
  toast: 0.28,
  ambient: 4,
  magnetic: 0.8,
};

const EASES: Record<MotionProfile, string> = {
  reveal: 'power3.out',
  modal: 'power3.out',
  banner: 'power2.out',
  toast: 'power3.out',
  ambient: 'sine.inOut',
  magnetic: 'back.out(1.5)',
};

export function getMotionTier(ctx: MotionContext): MotionTier {
  if (ctx.prefersReducedMotion) return 'off';

  const cores = ctx.hardwareConcurrency ?? 6;
  const memory = ctx.deviceMemory ?? 4;
  if (cores <= 2 || memory <= 1) return 'off';
  if (ctx.saveData) return 'minimal';

  let score = 0;

  if (cores >= 10) score += 1;
  else if (cores <= 4) score -= 1;

  if (memory >= 8) score += 1;
  else if (memory <= 4) score -= 1;

  if (ctx.isTouch) score -= 1;

  if (score >= 2) return 'full';
  if (score <= -2) return 'minimal';
  return 'balanced';
}

export function canAnimate(tier: MotionTier): boolean {
  return tier !== 'off';
}

export function getGsapVars(
  tier: MotionTier,
  profile: MotionProfile,
): gsap.TweenVars {
  if (tier === 'off') {
    return {
      duration: 0,
      ease: 'none',
    };
  }

  const baseDuration = DURATIONS[profile];
  const baseEase = EASES[profile];

  if (tier === 'minimal') {
    if (profile === 'ambient') {
      return { duration: 0, ease: 'none' };
    }
    if (profile === 'magnetic') {
      return { duration: 0.35, ease: 'power2.out' };
    }
    return {
      duration: Math.max(0.12, baseDuration * 0.6),
      ease: 'power2.out',
    };
  }

  if (tier === 'balanced' && profile === 'ambient') {
    return {
      duration: baseDuration * 1.1,
      ease: baseEase,
    };
  }

  return {
    duration: baseDuration,
    ease: baseEase,
  };
}
