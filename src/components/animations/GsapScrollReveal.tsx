import React, { useEffect, useRef, ReactNode } from 'react';
import gsap from 'gsap';
import { canAnimate } from '../../lib/motion/motionPolicy';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { revealIn } from '../../lib/motion/presets';
import { useMotionTier } from '../../lib/motion/useMotionTier';

export interface GsapScrollRevealProps {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  distance?: number;
  delay?: number;
  duration?: number;
  stagger?: number;
  className?: string;
}

export const GsapScrollReveal: React.FC<GsapScrollRevealProps> = ({
  children,
  direction = 'up',
  distance = 36,
  delay = 0,
  duration,
  stagger = 0,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tier = useMotionTier();

  useEffect(() => {
    registerGsapPlugins();

    return withGsapContext(containerRef.current, () => {
      const el = containerRef.current;
      if (!el) return;

      const targets = Array.from(el.children);
      if (targets.length === 0) return;

      if (!canAnimate(tier)) {
        gsap.set(targets, { clearProps: 'transform,opacity,visibility' });
        return;
      }

      let x = 0;
      let y = 0;
      if (direction === 'up') y = distance;
      else if (direction === 'down') y = -distance;
      else if (direction === 'left') x = distance;
      else if (direction === 'right') x = -distance;

      gsap.set(targets, { autoAlpha: 0, x, y });
      gsap.to(targets, revealIn(tier, { delay, duration, stagger: stagger || undefined }));
    });
  }, [delay, direction, distance, duration, stagger, tier]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};

export default GsapScrollReveal;
