import fs from 'node:fs';

const changelogPath = 'CHANGELOG.md';
const raw = fs.readFileSync(changelogPath, 'utf8');
const lines = raw.split(/\r?\n/);

const start = lines.findIndex((line) => line.startsWith('## ['));
if (start < 0) {
  console.error('[changelog:check] ERROR: No release section found (expected `## [vX.Y] - YYYY-MM-DD`).');
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i += 1) {
  if (lines[i].startsWith('## [')) {
    end = i;
    break;
  }
}

const section = lines.slice(start, end);
const header = section[0] || '';
if (!/^## \[[^\]]+\]\s*[-\u2014]\s*\d{4}-\d{2}-\d{2}/.test(header)) {
  console.error('[changelog:check] ERROR: Latest release header must be `## [vX.Y] - YYYY-MM-DD`.');
  process.exit(1);
}

const hasEvolution = section.some((line) => /^###\s+Evolution:/.test(line));
const numberedHeadings = section.filter((line) => /^####\s+\d+\)\s+/.test(line)).length;
const hasWhyItMatters = section.some((line) => /^####\s+\d+\)\s+Why This Release Matters/.test(line));

if (!hasEvolution) {
  console.error('[changelog:check] ERROR: Latest release must include `### Evolution: ...`.');
  process.exit(1);
}

if (numberedHeadings < 3) {
  console.error('[changelog:check] ERROR: Latest release needs at least 3 numbered subsections (`#### 1) ...`).');
  process.exit(1);
}

if (!hasWhyItMatters) {
  console.error('[changelog:check] ERROR: Latest release must include a `Why This Release Matters` subsection.');
  process.exit(1);
}

console.log('[changelog:check] OK - latest release format matches policy.');
