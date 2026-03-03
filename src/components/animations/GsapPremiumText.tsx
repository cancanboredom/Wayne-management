import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { canAnimate } from '../../lib/motion/motionPolicy';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { revealIn } from '../../lib/motion/presets';
import { useMotionTier } from '../../lib/motion/useMotionTier';
import { SplitText } from '../../lib/gsap/SplitText';
import { CustomEase } from '../../lib/gsap/CustomEase';

CustomEase.create('premium-ease', 'M0,0 C0.126,0.382 0.282,0.674 0.44,0.822 0.632,1.002 0.818,1.001 1,1');

export interface GsapPremiumTextProps {
  text: string;
  as?: React.ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
  type?: 'chars' | 'words' | 'lines';
}

export const GsapPremiumText: React.FC<GsapPremiumTextProps> = ({
  text,
  as: Component = 'div',
  className = '',
  delay = 0.2,
  stagger = 0.02,
  type = 'chars',
}) => {
  const textRef = useRef<HTMLElement>(null);
  const tier = useMotionTier();

  useEffect(() => {
    registerGsapPlugins();

    const el = textRef.current;
    if (!el) return;

    if (!canAnimate(tier)) {
      gsap.set(el, { clearProps: 'transform,opacity,visibility' });
      return;
    }

    const splitType = tier === 'minimal' && type === 'chars' ? 'words' : type;

    let split: SplitText | null = null;
    const cleanup = withGsapContext(el, () => {
      split = new SplitText(el, { type: splitType });
      const targets = splitType === 'chars' ? split!.chars : splitType === 'words' ? split!.words : split!.lines;

      gsap.set(targets, {
        y: 28,
        opacity: 0,
        rotationX: -26,
        transformOrigin: '50% 50% -24',
      });

      gsap.to(targets, revealIn(tier, {
        y: 0,
        rotationX: 0,
        delay,
        ease: 'premium-ease',
        stagger: tier === 'minimal' ? Math.min(stagger, 0.012) : stagger,
      }));
    });

    return () => {
      cleanup();
      split?.revert();
    };
  }, [delay, stagger, text, tier, type]);

  return (
    <Component ref={textRef} className={className}>
      {text}
    </Component>
  );
};

export default GsapPremiumText;
