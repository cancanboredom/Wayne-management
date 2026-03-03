import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { canAnimate } from '../../lib/motion/motionPolicy';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { bannerIn, getPresenceFrom, modalIn, toastIn } from '../../lib/motion/presets';
import { useMotionTier } from '../../lib/motion/useMotionTier';

type PresencePreset = 'modal' | 'banner' | 'toast';

interface GsapPresenceProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  preset?: PresencePreset;
}

export function GsapPresence({
  children,
  preset = 'modal',
  ...rest
}: GsapPresenceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tier = useMotionTier();

  useEffect(() => {
    registerGsapPlugins();
    return withGsapContext(ref.current, () => {
      const el = ref.current;
      if (!el) return;

      if (!canAnimate(tier)) {
        gsap.set(el, { clearProps: 'transform,opacity,visibility' });
        return;
      }

      gsap.set(el, getPresenceFrom(preset));

      if (preset === 'banner') {
        gsap.to(el, bannerIn(tier));
        return;
      }

      if (preset === 'toast') {
        gsap.to(el, toastIn(tier));
        return;
      }

      gsap.to(el, modalIn(tier));
    });
  }, [preset, tier]);

  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}

export default GsapPresence;
