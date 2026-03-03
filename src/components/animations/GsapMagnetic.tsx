import React, { useEffect, useRef, ReactNode } from 'react';
import gsap from 'gsap';
import { canAnimate, getGsapVars } from '../../lib/motion/motionPolicy';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { useMotionTier } from '../../lib/motion/useMotionTier';

export interface GsapMagneticProps {
  children: ReactNode;
  magneticStrength?: number;
  className?: string;
}

export const GsapMagnetic: React.FC<GsapMagneticProps> = ({
  children,
  magneticStrength = 0.5,
  className = 'inline-block',
}) => {
  const magneticRef = useRef<HTMLDivElement>(null);
  const tier = useMotionTier();

  useEffect(() => {
    registerGsapPlugins();

    const el = magneticRef.current;
    if (!el) return;

    if (!canAnimate(tier) || tier === 'minimal') {
      gsap.set(el, { clearProps: 'transform' });
      return;
    }

    const cleanupContext = withGsapContext(el, () => {
      const xTo = gsap.quickTo(el, 'x', getGsapVars(tier, 'magnetic'));
      const yTo = gsap.quickTo(el, 'y', getGsapVars(tier, 'magnetic'));

      const mouseMove = (e: MouseEvent) => {
        const { clientX, clientY } = e;
        const { height, width, left, top } = el.getBoundingClientRect();

        const x = (clientX - (left + width / 2)) * magneticStrength;
        const y = (clientY - (top + height / 2)) * magneticStrength;

        xTo(x);
        yTo(y);
      };

      const mouseLeave = () => {
        xTo(0);
        yTo(0);
      };

      el.addEventListener('mousemove', mouseMove);
      el.addEventListener('mouseleave', mouseLeave);

      return () => {
        el.removeEventListener('mousemove', mouseMove);
        el.removeEventListener('mouseleave', mouseLeave);
      };
    });

    return cleanupContext;
  }, [magneticStrength, tier]);

  return (
    <div ref={magneticRef} className={className}>
      {children}
    </div>
  );
};

export default GsapMagnetic;
