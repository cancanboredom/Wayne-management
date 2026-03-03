import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const EXTENSIONS = new Set(['.ts', '.tsx']);

const RULES = [
  { label: 'legacy-garble-token', regex: /!5@/g },
  { label: 'legacy-garble-token', regex: /AH91@'#/g },
  { label: 'replacement-char', regex: /\uFFFD/g },
  { label: 'utf8-mojibake-thai', regex: /à¸|à¹/g },
  { label: 'utf8-mojibake-latin', regex: /Ã.|Â./g },
];

function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const files = fs.existsSync(ROOT) ? collectFiles(ROOT) : [];
const findings = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of RULES) {
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(line)) continue;
      findings.push({
        file,
        line: i + 1,
        rule: rule.label,
        sample: line.trim().slice(0, 180),
      });
    }
  }
}

if (findings.length > 0) {
  console.error('[text-corruption:check] ERROR: suspicious mojibake/corrupted text detected.');
  for (const item of findings) {
    console.error(`- ${item.file}:${item.line} [${item.rule}] ${item.sample}`);
  }
  process.exit(1);
}

console.log(`[text-corruption:check] OK - scanned ${files.length} files, no corruption signatures found.`);
