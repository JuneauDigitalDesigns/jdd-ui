// Prop-driven visual skins for catalog variants. Pure data + a class resolver;
// safe to import from both client components and the server-side export helpers.
/* SURFACE ROLES (`default` | `soft` | `inverted`) have replaced the old design-attitude
   names (`editorial` | `contrast` | `quiet`). A role says where a section sits in the page
   rhythm; an attitude said what it should feel like, which stopped being useful once the
   catalog stopped being editorial. See design/catalog-v2/SPEC.md §1.

   All 28 components are migrated, so nothing AUTHORS the old names any more. They remain in
   `SkinId` and in `skinClasses` for one reason: an already-exported client repo has the old
   value baked into its page.tsx as a literal, and must keep rendering until it is
   re-exported. `isValidSkin` will reject it (studio-readback.ts drops values it no longer
   recognises), so on re-export that client silently falls back to the default surface. That
   reset was accepted deliberately; it is not a bug to chase.

   Once every client has been re-exported, the three old ids can be deleted from `SkinId`
   and their `case` arms removed. */
export type SkinId = 'editorial' | 'contrast' | 'quiet' | 'default' | 'soft' | 'inverted';
export type SkinDef = { id: SkinId; label: string };

/* The old `ED` / `CT` / `QT` definitions are gone — every component declares surface roles
   now. The old *ids* remain in `SkinId` and in `skinClasses` on purpose, so an already-
   exported client repo whose page.tsx still says `skin="editorial"` keeps rendering
   correctly until it is re-exported. Only the authoring vocabulary changed. */
const DEF: SkinDef = { id: 'default', label: 'Default' };
const SOFT: SkinDef = { id: 'soft', label: 'Soft' };
const INV: SkinDef = { id: 'inverted', label: 'Inverted' };

// Skins offered per component (by component name). A single-entry list hides the toggle.
// Mirrored by the export validation (isValidSkin).
export const SKINS: Record<string, SkinDef[]> = {
  // hero
  HeroSplit: [DEF, INV], HeroFormFocus: [DEF, SOFT],
  // nav
  NavMinimal: [DEF, INV], NavEmergencyBar: [INV, DEF],
  // trust
  TrustReviewsAggregate: [DEF, SOFT], ServiceArea: [SOFT, DEF, INV],
  // about
  AboutFeature: [DEF, SOFT, INV], AboutStory: [DEF, SOFT],
  // services
  ServicesGrid: [SOFT, DEF],
  // work (reframed as recent jobs)
  BeforeAfter: [DEF, SOFT, INV], RecentJobsGrid: [DEF, SOFT],
  // testimonials
  TestimonialsGrid: [SOFT, DEF],
  // faq
  FaqAccordion: [DEF, SOFT, INV], FaqStickyAside: [SOFT, DEF],
  // finalCta
  FinalCtaSplit: [DEF, SOFT],
  // contact
  ContactSplit: [DEF, SOFT, INV], ContactCardOverlap: [DEF, SOFT], ContactInlineStrip: [DEF, INV],
  // footer
  FooterColumns: [INV, DEF], FooterMinimal: [INV, DEF],
  // seo has no skins
};

export function skinsFor(name: string): SkinDef[] {
  return SKINS[name] ?? [DEF];
}
export function defaultSkin(name: string): SkinId {
  return skinsFor(name)[0].id;
}
export function isValidSkin(name: string, skin: string): boolean {
  return skinsFor(name).some((s) => s.id === skin);
}

/**
 * True only for components that actually declare a `skin` prop (i.e. listed in SKINS).
 * `skinsFor` falls back to a synthetic single-entry list for every other component so the
 * UI has a safe default to reason about — but that fallback must never be baked into an
 * export as a literal `skin="..."` JSX attribute, since those components don't accept one
 * and the client repo's TypeScript build would fail on the excess prop.
 */
export function supportsSkin(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SKINS, name);
}

export type SkinClasses = {
  section: string;
  heading: string;
  body: string;
  eyebrow: string;
  rule: string;
  card: string;
  cardRule: string;
};

/** Shared surface + typography treatment per skin; components compose these with their own layout. */
export function skinClasses(skin: SkinId): SkinClasses {
  switch (skin) {
    /* ── surface roles ────────────────────────────────────────────────────────
       `soft` is the alternating band. It has no old-name equivalent: the old set
       had no way to say "same colours, one step back" so sections were separated
       by hairline rules instead, which is what the recomposition removes. */
    case 'soft':
      return {
        section: 'bg-bgSoft text-ink',
        heading: 'text-ink',
        body: 'text-inkSoft',
        eyebrow: 'text-accent',
        rule: 'border-rule',
        card: 'bg-bg',
        cardRule: 'border-rule',
      };
    case 'inverted':
    case 'contrast':
      return {
        section: 'bg-inkPanel text-onInk',
        heading: 'text-onInk',
        body: 'text-onInkSoft',
        eyebrow: 'text-accent200',
        rule: 'border-ruleInk',
        card: 'bg-inkPanel2',
        cardRule: 'border-ruleInk',
      };
    case 'quiet':
      return {
        section: 'bg-bg text-ink',
        heading: 'text-ink',
        body: 'text-inkSoft',
        eyebrow: 'text-inkSoft',
        rule: 'border-rule',
        card: 'bg-bgSoft',
        cardRule: 'border-rule',
      };
    case 'editorial':
    default:
      return {
        section: 'bg-bg text-ink',
        heading: 'text-ink',
        body: 'text-inkSoft',
        eyebrow: 'text-accent',
        rule: 'border-rule',
        card: 'bg-bgSoft',
        cardRule: 'border-rule',
      };
  }
}
