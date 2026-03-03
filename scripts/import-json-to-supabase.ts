import fs from 'node:fs';

const INPUT = process.env.IMPORT_PATH || 'supabase/seed/sqlite-export.json';

function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`Input file not found: ${INPUT}`);
  }

  const raw = fs.readFileSync(INPUT, 'utf8');
  const data = JSON.parse(raw);

  console.log('Import dry-run summary:');
  console.log(`- workspaces: ${Array.isArray(data.workspaces) ? data.workspaces.length : 0}`);
  console.log(`- people: ${Array.isArray(data.people) ? data.people.length : 0}`);
  console.log(`- shifts: ${Array.isArray(data.shifts) ? data.shifts.length : 0}`);
  console.log(`- versions: ${Array.isArray(data.versions) ? data.versions.length : 0}`);
  console.log('Next step: wire Supabase REST/bulk SQL insert in this script for production import.');
}

main();
