// coverage:check — run the unit tests with coverage and compare the result
// with coverage-baseline.json, so coverage only goes down on purpose.
//
//   npm run coverage:check            fail if any number dropped
//   npm run coverage:check -- --update  save the current numbers as the baseline
//
// Fails when:
//   - the overall lines, statements, functions or branches %, or any folder's
//     or file's lines %, is more than TOLERANCE points below the baseline
//     (checking files too stops one file's lost tests hiding behind another's
//     new ones in the same folder);
//   - a folder in MINIMUMS is below its minimum lines %, whatever the baseline.
// A new untested file lowers its folder's %, so adding one means updating the
// baseline deliberately in the same commit.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOLERANCE = 0.5; // percentage points, so rounding noise never fails the check
const METRICS = ['lines', 'statements', 'functions', 'branches'];
// Lines % a folder must always reach. src/lib holds the shared helpers every
// screen relies on, so it stays well tested.
const MINIMUMS = { 'src/lib': 80 };

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(webDir, 'coverage-baseline.json');
const summaryPath = resolve(webDir, 'coverage/coverage-summary.json');
const update = process.argv.includes('--update');

// 1. Run the tests with coverage. A failing test stops here.
execFileSync('npx', ['vitest', 'run', '--coverage'], { cwd: webDir, stdio: 'inherit' });

// 2. Overall numbers, and lines % per folder (e.g. src/lib, src/features/sales).
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const percent = (covered, total) => (total === 0 ? 100 : Math.round((covered / total) * 10000) / 100);

const overall = Object.fromEntries(METRICS.map((metric) => [metric, summary.total[metric].pct]));
const folderLines = {};
const byFile = {};
for (const [absolutePath, numbers] of Object.entries(summary)) {
  if (absolutePath === 'total') continue;
  const file = relative(webDir, absolutePath);
  byFile[file] = { lines: numbers.lines.pct };
  const folder = dirname(file);
  folderLines[folder] ??= { covered: 0, total: 0 };
  folderLines[folder].covered += numbers.lines.covered;
  folderLines[folder].total += numbers.lines.total;
}
const byFolder = Object.fromEntries(
  Object.keys(folderLines)
    .sort()
    .map((folder) => [folder, { lines: percent(folderLines[folder].covered, folderLines[folder].total) }]),
);
const current = {
  overall,
  byFolder,
  byFile: Object.fromEntries(Object.keys(byFile).sort().map((file) => [file, byFile[file]])),
};

// A minimum holds whatever the baseline says, so --update can't lower it.
const belowMinimum = Object.entries(MINIMUMS)
  .filter(([folder, minimum]) => (byFolder[folder]?.lines ?? 0) < minimum)
  .map(([folder, minimum]) => `${folder} lines: ${byFolder[folder]?.lines ?? 0}%, minimum ${minimum}%`);

if (update) {
  if (belowMinimum.length > 0) {
    console.error('\nNot saved: below the minimum.');
    for (const line of belowMinimum) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
  const baseline = { updated: new Date().toLocaleDateString('en-CA') /* local YYYY-MM-DD */, web: current };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nBaseline saved to coverage-baseline.json (lines ${overall.lines}%).`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error('\nNo coverage-baseline.json yet. Run `npm run coverage:check -- --update` to create it.');
  process.exit(1);
}

// 3. Compare with the baseline.
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).web;
const drops = [...belowMinimum];
const rises = [];

function compare(label, was, now) {
  if (now < was - TOLERANCE) drops.push(`${label}: ${was}% → ${now}%`);
  else if (now > was + TOLERANCE) rises.push(`${label}: ${was}% → ${now}%`);
}

for (const metric of METRICS) compare(`overall ${metric}`, baseline.overall[metric], overall[metric]);
for (const [folder, { lines }] of Object.entries(byFolder)) {
  const was = baseline.byFolder[folder]?.lines;
  if (was === undefined) rises.push(`${folder}: new folder at ${lines}% lines`);
  else compare(`${folder} lines`, was, lines);
}
// Files only drop: a new file shows in its folder's number, and a rise is
// already reported for the folder.
for (const [file, { lines }] of Object.entries(current.byFile)) {
  const was = baseline.byFile?.[file]?.lines;
  if (was !== undefined && lines < was - TOLERANCE) drops.push(`${file} lines: ${was}% → ${lines}%`);
}

console.log('');
if (drops.length > 0) {
  console.error(`Coverage dropped below the baseline (${baseline.overall.lines}% lines):`);
  for (const drop of drops) console.error(`  ✗ ${drop}`);
  console.error('\nAdd tests, or if the drop is intended, run `npm run coverage:check -- --update` and commit the baseline.');
  process.exit(1);
}
console.log(`Coverage is at or above the baseline (lines ${overall.lines}%, baseline ${baseline.overall.lines}%).`);
if (rises.length > 0) {
  console.log('Up since the baseline:');
  for (const rise of rises) console.log(`  ↑ ${rise}`);
  console.log('Run `npm run coverage:check -- --update` to raise the baseline in this commit.');
}
