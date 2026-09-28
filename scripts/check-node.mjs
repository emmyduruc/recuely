// Fails fast when the wrong Node runs the repo scripts (SPEC.md §B2: Node 22 LTS).
// Plain JS on purpose: it must run on old Node versions to explain the problem.
// Why it matters: Nuxt's dev transform loads an ES module with require(), which Node < 20.19 / < 22.12 can't do,
// so `pnpm dev` starts but every page answers 500 ("oxc-walker: could not resolve a parseSync implementation").
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const required = pkg.engines.node.replace(/^>=\s*/, '');
const toParts = (version) => version.replace(/^v/, '').split('.').map(Number);
const [needMajor, needMinor = 0, needPatch = 0] = toParts(required);
const [major, minor, patch] = toParts(process.version);

const ok =
  major > needMajor ||
  (major === needMajor && (minor > needMinor || (minor === needMinor && patch >= needPatch)));

if (!ok) {
  console.error(
    `\n✖ This repo needs Node >= ${required}, but ${process.version} is running (${process.execPath}).\n` +
      '  Run `nvm use` (reads .nvmrc) or `nvm alias default 22`, then try again.\n',
  );
  process.exit(1);
}
