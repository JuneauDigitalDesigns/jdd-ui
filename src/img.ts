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

/** The widths the Phase 11 export pipeline emits for every localized image. KEEP IN LOCKSTEP with
 *  console/src/lib/image-pipeline.ts's WIDTHS: a width named in a srcSet here that the pipeline
 *  never wrote is a 404 on a live client site. (Also used for origin-resize hosts below.) */
const WIDTHS = [640, 1024, 1536, 2048];

/** A localized asset emitted by the export pipeline: `/img/<hash>`, no width and no extension. The
 *  pipeline wrote `<hash>-<w>.webp` (and, for the hero, `<hash>-<w>.avif`) next to it. */
const isLocalAsset = (url: string): boolean => url.startsWith('/img/') && !/\.[a-z0-9]+$/i.test(url);

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
  // Localized export asset: expand `/img/<hash>` to the WebP widths the pipeline emitted. Checked
  // before the URL parse because this is a root-relative path, not an absolute URL.
  if (isLocalAsset(url)) {
    return {
      src: `${url}-1024.webp`,
      srcSet: WIDTHS.map((w) => `${url}-${w}.webp ${w}w`).join(', '),
    };
  }
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

/**
 * A <picture>-shaped result for a component that wants real per-format <source> elements. Only
 * meaningful for a LOCALIZED asset (`/img/<hash>`), where the pipeline wrote actual `.webp` (and,
 * for the hero, `.avif`) files. `avifSrcSet` is present ONLY when `opts.avif` is set AND the asset
 * is local: the export pipeline emits AVIF for the HERO slot alone (decision 44), because egress
 * is not the constraint on Vercel Pro but export duration is, and AVIF encode is the slow step. A
 * caller that gets `avifSrcSet: undefined` must emit no <source type="image/avif"> at all, or it
 * points the browser at files that were never written.
 *
 * For a non-local URL (the console preview on an origin URL) both srcSets are undefined and only
 * `src` is returned: the caller should fall back to responsiveImage for a plain <img srcSet>,
 * because an origin URL's bytes are format-negotiated and would lie inside a typed <source>.
 */
export function responsivePicture(
  url: string,
  opts?: { avif?: boolean },
): { avifSrcSet?: string; webpSrcSet?: string; src: string } {
  if (!url || !isLocalAsset(url)) return { src: url };
  return {
    src: `${url}-1024.webp`,
    webpSrcSet: WIDTHS.map((w) => `${url}-${w}.webp ${w}w`).join(', '),
    avifSrcSet: opts?.avif ? WIDTHS.map((w) => `${url}-${w}.avif ${w}w`).join(', ') : undefined,
  };
}
