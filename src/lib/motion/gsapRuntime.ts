import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from '../gsap/SplitText';
import { CustomEase } from '../gsap/CustomEase';

let registered = false;

export function registerGsapPlugins(): void {
  if (registered || typeof window === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
  registered = true;
}

export function withGsapContext(
  scope: Element | null,
  fn: () => void | (() => void),
): () => void {
  if (!scope) return () => undefined;
  let dispose: void | (() => void);
  const ctx = gsap.context(() => {
    dispose = fn();
  }, scope);
  return () => {
    if (typeof dispose === 'function') dispose();
    ctx.revert();
  };
}
