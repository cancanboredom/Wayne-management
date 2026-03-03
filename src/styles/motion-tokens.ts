/**
 * Antigravity Motion Tokens
 * ─────────────────────────
 * Single source of truth for every animation parameter in the project.
 * Import these instead of hard-coding easing / duration values.
 */

// ── Easing ──────────────────────────────────────────────────────────
/** CSS cubic-bezier string – use in inline styles & CSS variables */
export const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Framer Motion expects an array of four numbers */
export const EASING_ARRAY: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** GSAP named ease that matches the same curve */
export const GSAP_EASE = 'expo.out';

// ── Duration (seconds) ─────────────────────────────────────────────
export const DURATION = 1.2;
export const DURATION_FAST = 0.6;
export const DURATION_SLOW = 1.8;

// ── Stagger ─────────────────────────────────────────────────────────
export const STAGGER = 0.08;

// ── Float / Sine wave config ────────────────────────────────────────
export const FLOAT_CONFIG = {
    /** Peak displacement in px */
    amplitude: 6,
    /** Full cycle duration in seconds */
    frequency: 3,
} as const;

// ── Ready-made Framer Motion helpers ────────────────────────────────
export const transition = {
    duration: DURATION,
    ease: EASING_ARRAY,
};

export const transitionFast = {
    duration: DURATION_FAST,
    ease: EASING_ARRAY,
};

export const transitionSlow = {
    duration: DURATION_SLOW,
    ease: EASING_ARRAY,
};

/**
 * Common fade-up variant set.
 * Usage:  <motion.div variants={fadeUp} initial="hidden" animate="visible" />
 */
export const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: {
        opacity: 1,
        y: 0,
        transition,
    },
};

/**
 * Stagger children variant.
 * Usage:  <motion.ul variants={staggerContainer} initial="hidden" animate="visible">
 */
export const staggerContainer = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: STAGGER,
        },
    },
};

// ── GSAP defaults ───────────────────────────────────────────────────
export const GSAP_DEFAULTS = {
    ease: GSAP_EASE,
    duration: DURATION,
} as const;
