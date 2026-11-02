// `node --test` needs the loader registered in the parent process before it imports any
// test file; --import runs this first. Split from the hook itself because a module cannot
// register itself as its own loader.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-transpile.mjs', pathToFileURL(import.meta.filename));
