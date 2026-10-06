import type { CSSProperties } from 'react';
import { shade, mix, withAlpha } from './color';

/**
 * The shape these functions actually read — declared structurally rather than imported from
 * @jdd/schema on purpose.
 *
 * `template/` and every exported client repo define their SiteContent types locally and do
 * NOT depend on @jdd/schema, so importing `Brand` from it here would make this package fail
 * to typecheck in exactly the repos it is meant to serve. TypeScript is structural, so the
 * real `BrandContent` satisfies this without any nominal link, and the package stays
 * dependency-free.
 */
export type BrandLike = {
  palette: {
    accent: string;
    accentFg?: string | null;
    bg: string;
    bgSoft: string;
    ink: string;
    inkSoft: string;
    rule: string;
  };
  typography: {
    fontSans: string;
    fontHeading: string;
    headingWeight: number;
    bodyWeight: number;
  };
};

/**
 * The warm anchors. Decision 9 of console/design/DECISIONS-template-fidelity-v2.md moves every
 * default ground off pure white and every default ink off pure black / cool navy: research §5
 * records that both 2026 trend data and every Tier B measurement point the same way, and that
 * pure-white grounds plus indigo accents are a named AI-sameness tell (research §6 item 3).
 *
 * These are the fallbacks the derivation reaches for when the client's own ink is unusable, so
 * they have to be concrete values, not a hue rotation of something.
 *
 * Measured 2026-10-06: WARM_PAPER on WARM_INK is 17.10:1, so nothing is lost against the pure
 * pair it replaces.
 */
const WARM_INK = '#1A1512';    // warm charcoal. Replaces the old cool navy '#0f1b2d'.
const WARM_PAPER = '#FBF8F4';  // warm off-white. Replaces pure '#ffffff' as a FOREGROUND.

// Maps the brand palette + typography onto CSS custom properties. layout.tsx
// spreads these onto <body> so every component inherits them via Tailwind tokens
// (bg-accent, text-ink, border-rule, …) and the font-sans / font-heading families.
//
// Beyond the 7 authored brand tokens, we derive a richer set at runtime (tint ramp,
// gradient, and an on-brand dark "contrast" surface) so catalog components can reach
// for premium tones without any change to the brand schema.
export function paletteVars(brand: BrandLike): CSSProperties {
  const p = brand.palette;
  const { accent, ink, bg } = p;
  const accentStrong = shade(accent, 0.2);

  // On a dark palette `ink` is a near-white, so shading it produces a LIGHT panel
  // and `--on-ink` resolves to white-on-white. Anchor the contrast surface to the
  // background instead, and run the accent tint ramp toward bg rather than white
  // (tinting toward white on a dark page washes the ramp out to nothing).
  const dark = isDarkHex(bg);
  const inkPanel = dark ? shade(bg, 0.25) : shade(ink, 0.08);
  const onInk = readableOn(inkPanel, dark ? ink : WARM_INK);
  /* Decision 9 extends to the tint ramp: mixing the accent toward pure white produced faintly
     COOL tints sitting on a warm paper ground, which is the exact mismatch decision 9 exists to
     remove. Mixing toward WARM_PAPER keeps --accent-050/100/200 in the same temperature as the
     page. These are background tints, so the change is not contrast-bearing (WARM_PAPER is
     17.10:1 on the warm ink, against pure white's ~18:1). */
  const rampTarget = dark ? bg : WARM_PAPER;

  return {
    // ── authored tokens (unchanged) ──
    '--accent': accent,
    /* The schema's accentFg is a REQUEST, not an instruction — it is only honoured when it
       actually passes AA against the accent it sits on.

       Measured 2026-08-18: the e2e HVAC client sets accentFg "#FFFFFF" over accent "#e08b29",
       which is 2.66:1 — failing AA for both normal (4.5) and large (3.0) text. Because the
       old line was `p.accentFg ?? readableOn(...)`, an explicit value skipped the fallback
       entirely, so the computed-and-correct answer (brand ink, ~7:1) was overridden by a
       hand-entered one that failed. That was one of the three color-contrast failures
       holding Lighthouse Accessibility at 96. A client may not choose an illegible site. */
    /* `readableOn(accent, ink)` was WRONG on a dark palette. It picks whichever of white or
       its second argument contrasts better — and on a dark palette `ink` is a near-WHITE, so
       both candidates were light and it returned white regardless: #ffffff on #e08b29 is
       2.66:1, on #E05C2A 3.66:1, on a yellow accent 1.27:1. Every dark-palette client would
       have shipped an illegible primary CTA. Caught by the palette contrast suite, which
       exercises dark palettes; no client has used one yet, which is why it never surfaced.
       Passing `ink` is still right when ink actually IS dark — it keeps the label on-brand
       rather than pure black. */
    '--accent-fg': passesAA(p.accentFg, accent)
      ? (p.accentFg as string)
      : readableOn(accent, isDarkHex(ink) ? ink : WARM_INK),
    /* Accent, darkened until it clears AA as TEXT on the page background.

       `--accent` stays the authored brand color and remains correct for fills, borders and
       icons. But eyebrows and phone links render accent-colored TEXT, and a brand color
       picked to look vivid as a fill is very often illegible as type — #e08b29 on #ffffff is
       2.66:1. Anything rendering accent text must use this token, never `--accent`. */
    '--accent-text': accentText(accent, bg, p.bgSoft),
    /* Availability and emergency cues only ("24/7", "same-day"), never decoration. Pulled
       toward a canonical alert red so it reads as urgency rather than as more brand colour,
       then put through the same AA loop as --accent-text so it is legible as type. A client
       whose accent is already red gets something close to their accent, which is correct. */
    '--urgent': urgentTone(bg, p.bgSoft),
    '--bg': bg,
    '--bg-soft': p.bgSoft,
    '--ink': ink,
    '--ink-soft': p.inkSoft,
    '--rule': p.rule,
    // ── derived accent tones ──
    '--accent-050': mix(accent, rampTarget, 0.92),
    '--accent-100': mix(accent, rampTarget, 0.84),
    '--accent-200': mix(accent, rampTarget, 0.68),
    '--accent-strong': accentStrong,
    '--accent-glow': withAlpha(accent, 0.32),
    // DEPRECATED by decision 30(b). Still derived so shipped repos keep rendering; no new component may use it.
    '--accent-grad': `linear-gradient(135deg, ${accent} 0%, ${accentStrong} 100%)`,
    // ── on-brand dark ("contrast" skin) section tones ──
    '--ink-panel': inkPanel,
    '--ink-panel-2': mix(inkPanel, accent, 0.16),
    '--on-ink': onInk,
    '--on-ink-soft': withAlpha(onInk, 0.7),
    '--rule-ink': withAlpha(onInk, 0.16),
  } as CSSProperties;
}

export function typographyVars(brand: BrandLike): CSSProperties {
  const t = brand.typography;
  return {
    '--font-sans': t.fontSans,
    '--font-heading': t.fontHeading,
    '--heading-weight': String(t.headingWeight),
    '--body-weight': String(t.bodyWeight),
  } as CSSProperties;
}

/* `sectionVars` is intentionally NOT in this package. It is defined in template/src/lib/palette.ts
   (and its console twin) because those are TEMPLATE-OWNED files: an `overwrite` export refreshes
   them into every client repo with no @jdd/ui release. A copy here was added and never published;
   it was deleted rather than published, to avoid a star-export collision with the template's own
   definition. Keep the two twins byte-identical to each other. */

// ── Contrast helper ───────────────────────────────────────────────────────────
// Picks the more readable foreground (white or the brand ink) for text on the accent
// background, so accent CTAs stay legible whatever accent a client chooses. Used when
// brand.palette.accentFg is not explicitly set.
function relLuminance(hex: string): number {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG contrast ratio between two hex colors (1-21). Public because the console's brand
 * drawer shows an AA readout and must not duplicate the maths. Returns 1 (worst case, so
 * the UI flags it) on an unparseable color.
 */
export function contrast(a: string, b: string): number {
  try {
    return contrastRatio(relLuminance(a), relLuminance(b));
  } catch {
    return 1;
  }
}

/** True for backgrounds dark enough that light-palette assumptions invert. */
function isDarkHex(hex: string): boolean {
  try {
    return relLuminance(hex) < 0.18;
  } catch {
    return false;
  }
}

/** WCAG AA for normal text. Large text (18.66px bold / 24px) only needs 3.0, but these
 *  tokens are used at all sizes, so the stricter bar is the only safe one to hold. */
const AA_NORMAL = 4.5;

/** True when `fg` is set AND legible on `bg`. An unset or failing value returns false so the
 *  caller falls back to a computed foreground. */
function passesAA(fg: string | null | undefined, bg: string): boolean {
  if (!fg) return false;
  try {
    return contrastRatio(relLuminance(fg), relLuminance(bg)) >= AA_NORMAL;
  } catch {
    return false;
  }
}

/**
 * The brand accent pushed toward legibility as text on `bg`, stopping as soon as it clears
 * AA so the result stays as close to the authored color as possible.
 *
 * Steps toward black on a light background and toward white on a dark one. Bounded at 24
 * iterations: a pathological accent (a mid-grey on a mid-grey page) can never reach 4.5, and
 * in that case the readable ink/white fallback is correct and the loop must not hang.
 */
function accentText(accent: string, ...bgs: string[]): string {
  try {
    const [primary] = bgs;
    // Direction comes from the primary background; a page is light or dark as a whole, and
    // `--bg-soft` is by definition a near neighbour of `--bg`.
    const toward = isDarkHex(primary) ? WARM_PAPER : '#181310';
    let candidate = accent;
    for (let i = 0; i < 24; i++) {
      // Must clear AA on EVERY surface it can land on, not just --bg. This token is used by
      // `text-accent`, and a section can be `default` or `soft`, so deriving against --bg
      // alone left the soft surface untested: it passed by 0.03 on one client palette and
      // 0.08 on another, which is luck rather than a guarantee.
      if (bgs.every((b) => contrastRatio(relLuminance(candidate), relLuminance(b)) >= AA_NORMAL)) {
        return candidate;
      }
      // 8% per step, not a big jump: `mix(a,b,t)` is `a + (b-a)*t`, so a coarse t would
      // blacken the brand color in one pass. Small steps stop at the first passing shade,
      // which keeps the result recognisably the client's accent.
      candidate = mix(candidate, toward, 0.08);
    }
    return readableOn(primary);
  } catch {
    return readableOn(bgs[0]);
  }
}

/** The red every urgency tone is pulled toward. Fixed on purpose: "emergency" should look
 *  broadly the same across clients, or it stops reading as a signal. */
const ALERT_RED = '#B3251A';

/**
 * The urgency tone: a fixed alert red, adjusted only until it is legible on this client's
 * background.
 *
 * Deliberately NOT derived from the brand accent. An earlier version mixed 65% of the accent
 * in, which made "emergency" a different colour on every site and went muddy for hue-distant
 * brands (a teal accent produced #7f3f3b, a dull brick). Urgency is a signal, like a stop
 * sign, and a signal only works if it is the same signal everywhere. The brand colour already
 * owns the rest of the page.
 */
function urgentTone(...bgs: string[]): string {
  return accentText(ALERT_RED, ...bgs);
}

/** The warm off-white or `dark` (brand ink), whichever contrasts better against `bg`.
 *  Neither candidate is a pure value any more (decision 9): pure white on a dark panel is the
 *  cheap tell, and the warm off-white is 17.10:1 on the warm ink, so nothing is lost. */
export function readableOn(bg: string, dark = WARM_INK): string {
  try {
    const lb = relLuminance(bg);
    const lightC = contrastRatio(relLuminance(WARM_PAPER), lb);
    const darkC = contrastRatio(relLuminance(dark), lb);
    return darkC > lightC ? dark : WARM_PAPER;
  } catch {
    return WARM_PAPER;
  }
}
