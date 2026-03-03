import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { canAnimate } from '../../lib/motion/motionPolicy';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { revealIn } from '../../lib/motion/presets';
import { useMotionTier } from '../../lib/motion/useMotionTier';

export interface GsapStaggerTextProps {
  text: string;
  as?: React.ElementType;
  className?: string;
  delay?: number;
  duration?: number;
}

export const GsapStaggerText: React.FC<GsapStaggerTextProps> = ({
  text,
  as: Component = 'div',
  className = '',
  delay = 0,
  duration,
}) => {
  const containerRef = useRef<HTMLElement>(null);
  const tier = useMotionTier();

  const words = text.split(' ').map((word, index) => (
    <span key={index} className="inline-block overflow-hidden pb-2 mr-[0.25em] leading-[1.1]">
      <span className="word-inner inline-block translate-y-[120%] rotate-2 opacity-0 origin-bottom-left">
        {word}
      </span>
    </span>
  ));

  useEffect(() => {
    registerGsapPlugins();
    return withGsapContext(containerRef.current, () => {
      const el = containerRef.current;
      if (!el) return;

      const wordsInner = el.querySelectorAll('.word-inner');
      if (wordsInner.length === 0) return;

      if (!canAnimate(tier)) {
        gsap.set(wordsInner, { clearProps: 'transform,opacity,visibility' });
        return;
      }

      gsap.to(wordsInner, revealIn(tier, {
        y: '0%',
        rotation: 0,
        delay,
        duration,
        stagger: tier === 'minimal' ? 0.022 : 0.05,
        ease: 'power4.out',
      }));
    });
  }, [delay, duration, tier]);

  return (
    <Component ref={containerRef as any} className={className}>
      {words}
    </Component>
  );
};

export default GsapStaggerText;
