import type gsap from 'gsap';
import { getGsapVars } from './motionPolicy';
import type { MotionTier } from './types';

export function revealIn(tier: MotionTier, overrides: gsap.TweenVars = {}): gsap.TweenVars {
  return {
    y: 0,
    x: 0,
    autoAlpha: 1,
    ...getGsapVars(tier, 'reveal'),
    ...overrides,
  };
}

export function modalIn(tier: MotionTier, overrides: gsap.TweenVars = {}): gsap.TweenVars {
  return {
    y: 0,
    scale: 1,
    autoAlpha: 1,
    ...getGsapVars(tier, 'modal'),
    ...overrides,
  };
}

export function bannerIn(tier: MotionTier, overrides: gsap.TweenVars = {}): gsap.TweenVars {
  return {
    y: 0,
    autoAlpha: 1,
    ...getGsapVars(tier, 'banner'),
    ...overrides,
  };
}

export function toastIn(tier: MotionTier, overrides: gsap.TweenVars = {}): gsap.TweenVars {
  return {
    y: 0,
    autoAlpha: 1,
    ...getGsapVars(tier, 'toast'),
    ...overrides,
  };
}

export function ambientFloat(
  tier: MotionTier,
  overrides: gsap.TweenVars = {},
): gsap.TweenVars {
  if (tier === 'off' || tier === 'minimal') {
    return {
      duration: 0,
      repeat: 0,
      y: 0,
      x: 0,
      rotation: 0,
      autoAlpha: 1,
      ease: 'none',
      ...overrides,
    };
  }

  return {
    y: -9,
    rotation: 1.2,
    repeat: -1,
    yoyo: true,
    ...getGsapVars(tier, 'ambient'),
    ...overrides,
  };
}

export function getPresenceFrom(preset: 'modal' | 'banner' | 'toast'): gsap.TweenVars {
  if (preset === 'modal') return { autoAlpha: 0, y: 10, scale: 0.96 };
  if (preset === 'toast') return { autoAlpha: 0, y: 12 };
  return { autoAlpha: 0, y: -8 };
}
