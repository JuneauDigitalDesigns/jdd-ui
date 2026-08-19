// Responsive image sources for catalog components.
//
// WHY THIS EXISTS (measured, 2026-08-19)
// Recomposing the hero moved the LCP element from a text node to the hero photograph, and
// the photograph was being served at a single fixed width: 153KB of a 1200px-wide JPEG
// downloaded onto a 390px viewport. LCP went 1.5s -> 3.2s with 69% of it in Load Time, and
// Performance fell 100 -> 93. Nothing was wrong with the markup; the bytes were simply
// wrong for the device.
//
// INTERIM, ON PURPOSE. The real answer is the build-time pipeline in the plan: fetch each
// client image once, emit AVIF/WebP at several widths into /public, and reference those.
// That belongs in the export pipeline, which already writes into the client repo. Until it
// lands, this asks the ORIGIN for the right size, which costs nothing and works today.
//
// Only hosts whose resize contract we actually know are rewritten. Everything else passes
// through untouched and simply gets no srcset — degrading to current behaviour rather than
// producing a broken URL. Do not add a host here on the assumption it supports `?w=`.

/** Widths worth generating for a hero-scale image. Wider than the CSS box on purpose: a 2x
 *  phone at 390px CSS is asking for ~780 real pixels. */
const WIDTHS = [480, 640, 828, 1080, 1280, 1600];

type Rewriter = (url: URL, w: number) => string;

const HOSTS: { test: RegExp; rewrite: Rewriter }[] = [
  {
    // Unsplash's Imgix-backed delivery: `w` is honoured, and `auto=format` already gives us
    // WebP/AVIF negotiation for free. This is what fillImagePlaceholders emits.
    test: /(^|\.)images\.unsplash\.com$/,
    rewrite: (url, w) => {
      const u = new URL(url.toString());
      u.searchParams.set('w', String(w));
      u.searchParams.set('auto', 'format');
      return u.toString();
    },
  },
];

export type ResponsiveImage = { src: string; srcSet?: string };

/**
 * A `srcSet` for `url` when the host is one we know how to resize, otherwise just the URL.
 *
 * `sizes` is deliberately NOT produced here — only the component knows how wide the image
 * renders at each breakpoint, and a wrong `sizes` is worse than none because the browser
 * trusts it over layout.
 */
export function responsiveImage(url: string): ResponsiveImage {
  if (!url) return { src: url };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { src: url }; // relative or malformed — leave it alone
  }
  const host = HOSTS.find((h) => h.test.test(parsed.hostname));
  if (!host) return { src: url };

  return {
    src: url,
    srcSet: WIDTHS.map((w) => `${host.rewrite(parsed, w)} ${w}w`).join(', '),
  };
}
