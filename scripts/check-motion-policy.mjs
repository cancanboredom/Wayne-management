#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');

const ALLOWLIST = new Set([
  // Temporary migration allowances can be added here as absolute-from-root paths.
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const ALLOWED_EXCEPTION_REASONS = new Set(['accessibility', 'system-native']);

const RULES = [
  {
    id: 'keyframes',
    regex: /@keyframes\b/,
    message: 'Do not define @keyframes. Use GSAP presets/components.',
  },
  {
    id: 'css-animation',
    regex: /\banimation\s*:/,
    message: 'Do not use CSS animation declarations. Use GSAP presets/components.',
  },
  {
    id: 'inline-animation',
    regex: /style\s*=\s*\{\{[^\n}]*\banimation\s*:/,
    message: 'Do not use inline style animation. Use GsapPresence / GSAP tweens.',
  },
  {
    id: 'transform-transition',
    regex: /transition\s*:\s*(all\b|[^;\n]*\btransform\b)/,
    message: 'Avoid ad-hoc transform transitions for motion choreography. Use GSAP.',
  },
];

function isVendorGaspFile(filePath) {
  return filePath.includes(`${path.sep}src${path.sep}lib${path.sep}gsap${path.sep}`);
}

function collectFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(fullPath));
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    out.push(fullPath);
  }
  return out;
}

function hasValidException(lines, index) {
  const start = Math.max(0, index - 2);
  const end = Math.min(lines.length - 1, index + 2);
  const slice = lines.slice(start, end + 1).join('\n');
  const match = slice.match(/motion-exception:\s*([a-z-]+)/);
  if (!match) return false;
  return ALLOWED_EXCEPTION_REASONS.has(match[1]);
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('[motion:check] src directory not found.');
    process.exit(1);
  }

  const violations = [];
  const files = collectFiles(SRC_DIR);

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
    if (ALLOWLIST.has(rel)) continue;
    if (isVendorGaspFile(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (!rule.regex.test(line)) continue;
        if (hasValidException(lines, i)) continue;
        violations.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          message: rule.message,
          snippet: line.trim(),
        });
      }
    });
  }

  if (violations.length > 0) {
    console.error('\n[motion:check] Motion policy violations found:\n');
    for (const v of violations) {
      console.error(`- ${v.file}:${v.line} [${v.rule}] ${v.message}`);
      console.error(`  ${v.snippet}`);
    }
    console.error(`\nTotal violations: ${violations.length}`);
    process.exit(1);
  }

  console.log('[motion:check] OK - no violations found.');
}

main();
