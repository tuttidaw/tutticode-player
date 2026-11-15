#!/usr/bin/env node
// Checks the examples site: every page links its SDK from tuttidaw.com, the
// README's links point at files that exist, and every TuttiCode program on
// the pages (code='...' attributes, iframe fragments, template strings in
// scripts) is extracted to out/programs/*.tc for `tutticode check`.
//
//   node scripts/validate.mjs        # then: npx tutticode check out/programs/*.tc
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];
const pages = ['index.html', ...readdirSync(join(root, 'examples'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `examples/${f}`)];

const out = join(root, 'out', 'programs');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let count = 0;
const keep = (page, program) => {
  const code = program.trim();
  if (!/^setcpm\(/.test(code)) return;
  count += 1;
  writeFileSync(join(out, `${page.replace(/[/.]/g, '-')}-${count}.tc`), `${code}\n`);
};

for (const page of pages) {
  // <pre> blocks show markup to the reader (escaped, sometimes shortened);
  // only the live markup around them plays.
  const html = readFileSync(join(root, page), 'utf8').replace(/<pre[\s\S]*?<\/pre>/g, '');
  for (const m of html.matchAll(/\scode='([^']*)'/g)) keep(page, m[1]);
  for (const m of html.matchAll(/`(setcpm\([^`]*)`/g)) keep(page, m[1]);
  for (const m of html.matchAll(/src="https:\/\/tuttidaw\.com\/embed\/code\?[^#"]*#([^"]+)"/g)) {
    let code = '';
    try {
      code = Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8');
    } catch {
      // reported below
    }
    if (/^setcpm\(/.test(code.trim())) keep(page, code);
    else errors.push(`${page}: an iframe fragment does not decode to a program`);
  }
  const usesSdk = /tuttidaw\.com\/embed\/v1\.js|@tuttidaw\/tutticode-player@1/.test(html);
  const usesIframe = /tuttidaw\.com\/embed\/code/.test(html);
  if (!usesSdk && !usesIframe) errors.push(`${page}: neither the SDK nor the player iframe`);
}

for (const readme of readdirSync(root).filter((f) => /^README(\..+)?\.md$/.test(f))) {
  const text = readFileSync(join(root, readme), 'utf8');
  for (const m of text.matchAll(/\]\(((?:examples\/|docs\/)[^)#]+|index\.html|LICENSE)\)/g)) {
    if (!existsSync(join(root, m[1]))) errors.push(`${readme}: link to missing ${m[1]}`);
  }
  for (const m of text.matchAll(/\]\(https:\/\/tuttidaw\.github\.io\/embed\/([^)#]*)\)/g)) {
    if (m[1] && !existsSync(join(root, m[1]))) errors.push(`${readme}: live link to missing ${m[1]}`);
  }
  for (const m of text.matchAll(/\]\(https:\/\/tuttidaw\.com\/code#([^)]+)\)/g)) {
    const code = Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8');
    if (!/^setcpm\(/.test(code)) errors.push(`${readme}: a play link does not decode to a program`);
    else keep(readme, code);
  }
}

if (count === 0) errors.push('no programs found');
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.log(`ok: ${pages.length} pages, ${count} programs in out/programs`);
