// Shared framer-motion presets for the catalog.
//
// Two tiers:
//  1. Micro-interactions (default, use freely) — reveals, staggers, hover lifts.
//  2. Signature scroll effects (opt-in, use SPARINGLY) — parallaxY, clipReveal.
//     At most one signature moment per section; they are a standout, not a default.
//
// All effects must no-op under the `quiet` skin / prefers-reduced-motion via
// stillFor(). See DESIGN-LANGUAGE.md for when each move applies.
import { useScroll, useTransform, type MotionValue, type Variants } from 'framer-motion';
import type { RefObject } from 'react';
import type { SkinId } from './skins';

export const EASE = [0.16, 1, 0.3, 1] as const;
export const viewportOnce = { once: true, amount: 0.3 } as const;

export const reveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export const revealStagger = (stagger = 0.06): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

/**
 * True when a component should render with no entrance motion.
 *
 * Takes the full `SkinId` rather than the old three literals, because the surface roles
 * (`default` | `soft` | `inverted`) now exist alongside them. None of the roles is a "still"
 * role: `quiet` was the opt-out, and that job now belongs to the global motion policy
 * (nothing above the fold animates on load; below-fold reveals are CSS). For a role this
 * therefore reduces to honouring reduced-motion, which is the part that was ever
 * load-bearing.
 */
export function stillFor(skin: SkinId, reduce: boolean): boolean {
  return reduce || skin === 'quiet';
}

// ── Signature scroll effects (opt-in) ────────────────────────────────────────
// Client-only: these are React hooks / hook-derived values and must be called
// from `'use client'` components. Gate with stillFor() so quiet + reduced-motion
// stay static.

/**
 * Scroll-linked vertical parallax for a section's feature imagery.
 * Returns a MotionValue<string> to spread onto `style={{ y }}`. Pass `still` to
 * opt out (returns a static value the caller can ignore). Keep the range gentle —
 * this is depth, not motion sickness.
 *
 * @example
 *   const ref = useRef<HTMLElement>(null);
 *   const y = parallaxY(ref, still);
 *   <motion.div style={still ? undefined : { y }} />
 */
export function parallaxY(
  target: RefObject<HTMLElement | null>,
  still: boolean,
  range: [string, string] = ['-6%', '6%'],
): MotionValue<string> {
  // Hooks must run unconditionally; `still` callers simply don't bind the result.
  const { scrollYProgress } = useScroll({ target, offset: ['start end', 'end start'] });
  return useTransform(scrollYProgress, [0, 1], range);
}

/**
 * Editorial "rise into frame" — the panel is revealed top-to-bottom via a
 * clip-path wipe as it scrolls into view. Pair with viewportOnce.
 */
export const clipReveal: Variants = {
  hidden: { clipPath: 'inset(0 0 100% 0)' },
  show: { clipPath: 'inset(0 0 0% 0)', transition: { duration: 0.9, ease: EASE, delay: 0.1 } },
};
