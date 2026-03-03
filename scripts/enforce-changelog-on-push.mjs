import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function runGit(args, { allowFail = false } = {}) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return '';
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[changelog:push-check] ERROR: git ${args} failed\n${msg}`);
    process.exit(1);
  }
}

function getRangeToPush() {
  const upstream = runGit('rev-parse --abbrev-ref --symbolic-full-name @{u}', { allowFail: true });
  if (upstream) return `${upstream}...HEAD`;
  const hasParent = runGit('rev-parse --verify HEAD~1', { allowFail: true });
  if (hasParent) return 'HEAD~1..HEAD';
  return '';
}

function parseLatestVersion(changelogRaw) {
  const m = changelogRaw.match(/^## \[v?(\d+)\.(\d+)\]/m);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

function parseShortStat(shortStat) {
  const files = Number((shortStat.match(/(\d+)\s+files?\s+changed/) || [])[1] || 0);
  const insertions = Number((shortStat.match(/(\d+)\s+insertions?\(\+\)/) || [])[1] || 0);
  const deletions = Number((shortStat.match(/(\d+)\s+deletions?\(-\)/) || [])[1] || 0);
  return { files, insertions, deletions, lines: insertions + deletions };
}

function nextVersionSuggestion(current, changeSize) {
  const isMajor = changeSize.files >= 10 || changeSize.lines >= 250;
  if (isMajor) return `v${current.major + 1}.0`;
  return `v${current.major}.${current.minor + 1}`;
}

function runFormatCheck() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const checkScript = path.join(scriptDir, 'check-changelog-format.mjs');
  try {
    execSync(`node "${checkScript}"`, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

const changelogPath = 'CHANGELOG.md';
if (!fs.existsSync(changelogPath)) {
  console.error('[changelog:push-check] ERROR: CHANGELOG.md not found.');
  process.exit(1);
}

const range = getRangeToPush();
if (!range) {
  console.log('[changelog:push-check] INFO: No diff range detected; skipping push changelog guard.');
  process.exit(0);
}

const filesChanged = runGit(`diff --name-only ${range}`)
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

if (filesChanged.length === 0) {
  console.log('[changelog:push-check] INFO: No changed files in push range.');
  process.exit(0);
}

const changelogTouched = filesChanged.some((f) => f.replace(/\\/g, '/') === 'CHANGELOG.md');

if (changelogTouched) {
  runFormatCheck();
  console.log('[changelog:push-check] OK: CHANGELOG.md updated and layout is valid.');
  process.exit(0);
}

const changelogRaw = fs.readFileSync(changelogPath, 'utf8');
const current = parseLatestVersion(changelogRaw);
if (!current) {
  console.error('[changelog:push-check] ERROR: Cannot parse latest version from CHANGELOG.md (`## [vX.Y]`).');
  process.exit(1);
}

const shortStat = runGit(`diff --shortstat ${range}`, { allowFail: true });
const stats = parseShortStat(shortStat);
const suggested = nextVersionSuggestion(current, stats);

console.error('[changelog:push-check] BLOCKED: Push requires changelog update.');
console.error(`[changelog:push-check] No CHANGELOG.md changes detected in range: ${range}`);
console.error(`[changelog:push-check] Change size: files=${stats.files}, lines=${stats.lines} (+${stats.insertions}/-${stats.deletions})`);
console.error(`[changelog:push-check] Suggested next version: ${suggested}`);
console.error('[changelog:push-check] Rule: large update -> major bump (X.0), small update -> minor bump (X.Y+1).');
console.error('[changelog:push-check] Then ensure latest block layout follows v4.2 style.');
process.exit(1);

