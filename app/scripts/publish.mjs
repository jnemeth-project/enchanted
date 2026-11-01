// Copies the built site (app/dist) to where GitHub Pages serves it: the repository root by default,
// or a sub-folder for a test copy (node scripts/publish.mjs next  ->  …/enchanted/next/).
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(app, '..');
const sub = process.argv[2] || '';
const out = resolve(repo, sub);
const dist = resolve(app, 'dist');
if (!existsSync(dist)) { console.error('build first: npm run build'); process.exit(1); }
for (const p of ['index.html', 'build', 'assets']) rmSync(resolve(out, p), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true });
console.log('published', dist, '->', out);
