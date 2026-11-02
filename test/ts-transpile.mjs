import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import ts from 'typescript';

/**
 * Letting `node --test` import this package's `.ts` / `.tsx` modules.
 *
 * Adapted from juneau-digital-designs test/ts-transpile.mjs — same constraint, same fix.
 * The runtime is pinned at Node v22.0.0, which cannot read TypeScript at all; type stripping
 * arrived in 22.6 behind a flag.
 *
 * This package has no build step on purpose: package.json's `exports` map points at raw
 * ./src/*.ts and the consumers compile it as part of their own builds (see src/index.ts for
 * why shipping compiled JS would break `'use client'`). So there is no emitted artefact a
 * test could import, and the alternative — a test holding its own copy of the thing it
 * checks — certifies the copy rather than what ships.
 *
 * `jsx: ReactJSX` is what lets LeadForm.tsx itself be imported, which is the whole point:
 * the disclosure tests render the real component, not a re-implementation of it.
 *
 * Deliberately *only* type stripping. `transpileModule` does no type checking — that is
 * `npm run typecheck`'s job and would be a waste to repeat per test run. A type error
 * surfaces there, not here.
 */

/** Extensions tried for an extensionless relative specifier, in TypeScript's own order. */
const EXTENSIONS = ['.ts', '.tsx', '.mts'];

function firstExisting(basePath) {
  for (const ext of EXTENSIONS) {
    if (existsSync(basePath + ext)) return basePath + ext;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  // No `@/*` branch here, unlike the agency copy: this package has no tsconfig `paths`, and
  // every internal import in src/ is already relative.
  const bare =
    specifier.startsWith('.') && context.parentURL
      ? resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
      : null;

  if (bare) {
    // An explicit extension is honoured as written; everything else is extensionless, the
    // way the source spells it under `moduleResolution: bundler`.
    const hit = EXTENSIONS.some((e) => bare.endsWith(e))
      ? existsSync(bare)
        ? bare
        : null
      : firstExisting(bare);
    if (hit) return { url: pathToFileURL(hit).href, format: 'module', shortCircuit: true };
  }

  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!EXTENSIONS.some((e) => url.endsWith(e))) return next(url, context);

  const path = fileURLToPath(url);
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: {
      // ESNext output so `import`/`export` survive untouched — anything that downlevels to
      // `require` would not load as an ES module here.
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      // Matches tsconfig. Without it `transpileModule` warns on every file, since a
      // single-file transform cannot know whether an exported name is a type.
      isolatedModules: true,
    },
  });

  return { format: 'module', source: outputText, shortCircuit: true };
}
