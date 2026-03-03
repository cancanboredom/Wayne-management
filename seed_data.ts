import Database from 'better-sqlite3';

const db = new Database('wayne_duty.db');

const testPeople = [
    { id: 'p1', name: 'Dr. John (1st/2nd, R1)', color: '#10b981', tagIds: ['first_call', 'second_call', 'r1sry'] },
    { id: 'p2', name: 'Dr. Alice (1st, R1)', color: '#3b82f6', tagIds: ['first_call', 'r1sry'] },
    { id: 'p3', name: 'Dr. Bob (1st, Intern)', color: '#f97316', tagIds: ['first_call', 'intern'] },
    { id: 'p4', name: 'Dr. Eve (1st, Intern)', color: '#eab308', tagIds: ['first_call', 'intern'], unavail: ['2026-03-05', '2026-03-12'] },
    { id: 'p5', name: 'Dr. Charlie (2nd, R1)', color: '#8b5cf6', tagIds: ['second_call', 'r1sry'] },
    { id: 'p6', name: 'Dr. Grace (2nd/3rd, R2)', color: '#ec4899', tagIds: ['second_call', 'third_call', 'r2sry'] },
    { id: 'p7', name: 'Dr. Dave (3rd, Staff)', color: '#6366f1', tagIds: ['third_call', 'staff'] },
    { id: 'p8', name: 'Dr. Frank (3rd, Staff)', color: '#06b6d4', tagIds: ['third_call', 'staff'] },
    { id: 'p9', name: 'Dr. Helen (1st/2nd, Extern)', color: '#84cc16', tagIds: ['first_call', 'second_call', 'extern'] },
    { id: 'p10', name: 'Dr. Ian (Intern)', color: '#ef4444', tagIds: ['first_call', 'intern'] },
];

const insertPerson = db.prepare(`
  INSERT INTO people (id, name, color, unavailableDates) 
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET 
    name=excluded.name, 
    color=excluded.color, 
    unavailableDates=excluded.unavailableDates
`);

const updateTags = db.prepare(`UPDATE people SET tagIds = ? WHERE id = ?`);

db.transaction(() => {
    for (const p of testPeople) {
        insertPerson.run(p.id, p.name, p.color, JSON.stringify(p.unavail || []));
        try {
            updateTags.run(JSON.stringify(p.tagIds), p.id);
        } catch (e) {
            console.log('Could not update tagIds, column might not exist yet.');
        }
    }
})();

console.log('Inserted 10 test personnel successfully!');
