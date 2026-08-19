# @jdd/ui

Shared design tokens, motion presets, the icon registry and the `LeadForm` island used by
the JDD component catalog. Consumed by the console (authoring), `template/`, and every
exported client repo.

## Shipped as source, not compiled

Unlike [`@jdd/schema`](https://github.com/JuneauDigitalDesigns/jdd-schema) — pure TypeScript
that builds on install — this package contains a React **client** component.

`'use client'` directives are routinely dropped or hoisted by a TypeScript emit, and Next
requires the directive to survive in the published JS for a client component imported from
`node_modules`. If it is lost, `LeadForm` silently becomes a server component and its
`useState` throws at build time in every consuming repo.

Shipping source and letting Next compile it removes that failure mode by construction.
Consumers must therefore set:

```js
// next.config.js
transpilePackages: ['@jdd/ui'],
```

## What is deliberately NOT here

**`editable.tsx`.** Its console and template versions are two different implementations, not
a drifted copy: the console one is interactive, the template one is an inert passthrough.
That seam is the only thing keeping `contentEditable` and the icon picker out of production
client sites, so unifying it would ship the studio's editing scaffolding to every client.

**`typographyVars`.** The console applies fonts to its preview subtree so the brand drawer's
font picker does something visible. A real site must not, since it would override the
catalog's own typography. The console keeps its own wrapper.

## Public on purpose

`github:` dependencies on a private repo cannot be fetched by Vercel's build without
credentials, and every client site builds on Vercel. `@jdd/schema` is public for the same
reason.
