// Size budget for the built site (R5, R15). Run after `vite build`:
//   node tools/check-size.mjs dist
// Fails if the home screen's code and styles, or the module-card media, go over budget.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME_CODE_BUDGET_BYTES = 3_000_000; // R5: home screen loads in about 3 MB or less
export const CARD_MEDIA_BUDGET_BYTES = 3_000_000; // R15: card videos total about 3 MB or less

// Files the home screen needs before anything else: index.html plus its entry
// script's static imports and styles. Dynamic imports (modules) are left out,
// because they load only when their module opens.
export function homeFiles(distDir) {
  const manifestPath = join(distDir, '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest['index.html'];
  if (!entry) throw new Error(`No index.html entry in ${manifestPath}`);

  const files = new Set(['index.html']);
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const asset of chunk.assets ?? []) files.add(asset);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit('index.html');
  return [...files];
}

function allFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? allFiles(join(dir, d.name)) : [join(dir, d.name)],
  );
}

export function measure(distDir) {
  // The card stills show as soon as the home screen opens, so they count too.
  const stills = allFiles(join(distDir, 'media', 'cards'))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => relative(distDir, f));
  const home = [...homeFiles(distDir), ...stills].map((f) => ({ file: f, bytes: statSync(join(distDir, f)).size }));
  // A browser downloads one format per card (WebM, or the MP4 fallback), so
  // each card counts at the size of its larger file.
  const byCard = new Map();
  for (const f of allFiles(join(distDir, 'media', 'cards')).filter((f) => /\.(webm|mp4)$/i.test(f))) {
    const card = f.replace(/\.(webm|mp4)$/i, '');
    const bytes = statSync(f).size;
    if (!byCard.has(card) || byCard.get(card).bytes < bytes) byCard.set(card, { file: relative(distDir, f), bytes });
  }
  const media = [...byCard.values()];
  const sum = (list) => list.reduce((n, x) => n + x.bytes, 0);
  return {
    home,
    homeBytes: sum(home),
    media,
    mediaBytes: sum(media),
  };
}

export function check(result) {
  const problems = [];
  if (result.homeBytes > HOME_CODE_BUDGET_BYTES) {
    problems.push(`The home screen (code, styles and card stills) is ${result.homeBytes} bytes, over the ${HOME_CODE_BUDGET_BYTES} byte budget (R5).`);
  }
  if (result.mediaBytes > CARD_MEDIA_BUDGET_BYTES) {
    problems.push(`Card videos are ${result.mediaBytes} bytes, over the ${CARD_MEDIA_BUDGET_BYTES} byte budget (R15).`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = process.argv[2] ?? 'dist';
  const result = measure(distDir);
  const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
  console.log(`Home screen: ${kb(result.homeBytes)} in ${result.home.length} files (budget ${kb(HOME_CODE_BUDGET_BYTES)})`);
  console.log(`Card videos: ${kb(result.mediaBytes)} in ${result.media.length} files (budget ${kb(CARD_MEDIA_BUDGET_BYTES)})`);
  const problems = check(result);
  for (const p of problems) console.error(p);
  process.exit(problems.length ? 1 : 0);
}
