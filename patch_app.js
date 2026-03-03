const fs = require('fs');
const path = require('path');

const appTsxPath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

// 1. Add peopleByMonth logic
if (!content.includes('peopleByMonth')) {
    content = content.replace(
        "const [people, setPeople] = useState<Person[]>([\n    { id: '1', name: 'John Doe', color: COLORS[0], role: 'intern', active: true },\n    { id: '2', name: 'Jane Smith', color: COLORS[1], role: 'r1sry', active: true },\n  ]);",
        `// Per-month personnel storage
  const currentMonthKey = format(currentDate, 'yyyy-MM');
  const [peopleByMonth, setPeopleByMonth] = useState<Record<string, Person[]>>({});
  const people = peopleByMonth[currentMonthKey] || [];
  const setPeopleForMonth = (newPeople: Person[] | ((prev: Person[]) => Person[])) => {
    setPeopleByMonth(prev => {
      const current = prev[currentMonthKey] || [];
      const resolved = typeof newPeople === 'function' ? newPeople(current) : newPeople;
      return { ...prev, [currentMonthKey]: resolved };
    });
  };`
    );

    // Replace setPeople with setPeopleForMonth
    content = content.replace(/setPeople\(\[\.\.\.people, newPerson\]\);/g, "setPeopleForMonth([...people, newPerson]);");
    content = content.replace(/setPeople\(people\.filter\(p => p\.id !== id\)\);/g, "setPeopleForMonth(people.filter(p => p.id !== id));");
    content = content.replace(/setPeople\(newPeople\);/g, "setPeopleForMonth(newPeople);");
    content = content.replace(/onChange=\{\(e\) => setPeople\(people\.map\(p => p\.id === person\.id \? \{ \.\.\.p, name: e\.target\.value \} : p\)\)\}/g, "onChange={(e) => setPeopleForMonth(people.map(p => p.id === person.id ? { ...p, name: e.target.value } : p))}");
    content = content.replace(/onChange=\{\(e\) => setPeople\(people\.map\(p => p\.id === person\.id \? \{ \.\.\.p, role: e\.target\.value as RoleKey \} : p\)\)\}/g, "onChange={(e) => setPeopleForMonth(people.map(p => p.id === person.id ? { ...p, role: e.target.value as RoleKey } : p))}");

    // Storage logic
    content = content.replace("const savedPeople = localStorage.getItem('wayne_people');", "const savedPeopleByMonth = localStorage.getItem('wayne_people_by_month');\n    const savedPeople = localStorage.getItem('wayne_people');");

    content = content.replace(
        "if (savedPeople) {\n      const parsed = JSON.parse(savedPeople);\n      const migrated = parsed.map((p: any) => ({\n        ...p,\n        role: p.role || 'others'\n      }));\n      setPeople(migrated);\n    }",
        `if (savedPeopleByMonth) {
      setPeopleByMonth(JSON.parse(savedPeopleByMonth));
    } else if (savedPeople) {
      // Migrate from old global format
      const parsed = JSON.parse(savedPeople);
      const migrated = parsed.map((p: any) => ({
        ...p,
        role: p.role || 'intern'
      }));
      const monthKey = format(new Date(), 'yyyy-MM');
      setPeopleByMonth({ [monthKey]: migrated });
    }`
    );

    content = content.replace(
        "localStorage.setItem('wayne_people', JSON.stringify(people));",
        "localStorage.setItem('wayne_people_by_month', JSON.stringify(peopleByMonth));"
    );

    // Add copyFromPreviousMonth function
    content = content.replace(
        "const toggleManualHighlight = (date: Date) => {",
        `const copyFromPreviousMonth = () => {
    const prevDate = subMonths(currentDate, 1);
    const prevKey = format(prevDate, 'yyyy-MM');
    const prevPeople = peopleByMonth[prevKey];
    if (prevPeople && prevPeople.length > 0) {
      const copied = prevPeople.map(p => ({
        ...p,
        id: Math.random().toString(36).substr(2, 9),
        unavailableDates: [],
      }));
      setPeopleForMonth(copied);
    } else {
      alert('No personnel found in the previous month.');
    }
  };

  const toggleManualHighlight = (date: Date) => {`
    );

    // Add UI for Copy from Previous Month
    content = content.replace(
        '<Plus className="w-5 h-5 mr-2" /> Add Person\n                    </button>',
        `<Plus className="w-5 h-5 mr-2" /> Add Person\n                    </button>\n                    <button\n                      onClick={copyFromPreviousMonth}\n                      className="flex-1 flex items-center justify-center p-3 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 font-bold transition-all shadow-sm disabled:opacity-50"\n                      disabled={!isExcelUnlocked}\n                    >\n                      <Copy className="w-4 h-4 mr-2" /> Copy From Prev Month\n                    </button>`
    );
}

// 2. Add UI states for Date Picker and Changelog Modal
if (!content.includes('showDatePicker')) {
    content = content.replace(
        "const [showPassword, setShowPassword] = useState(false);",
        `const [showPassword, setShowPassword] = useState(false);\n  const [showDatePicker, setShowDatePicker] = useState(false);\n  const [datePickerYear, setDatePickerYear] = useState(new Date().getFullYear());\n  const [showChangelogModal, setShowChangelogModal] = useState(false);`
    );
}

// 3. Date Picker UI logic in header
if (!content.includes('datePickerYear')) {
    const datePickerUI = `  <div className="flex items-center gap-4 relative">
                <button
                  onClick={() => {
                    setDatePickerYear(currentDate.getFullYear());
                    setShowDatePicker(!showDatePicker);
                  }}
                  className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl print:hidden hover:bg-emerald-100 transition-colors cursor-pointer"
                  title="Jump to month/year"
                >
                  <CalendarIcon className="w-6 h-6" />
                </button>
                {showDatePicker && (
                  <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 w-[280px]">
                    <div className="flex items-center justify-between mb-3">
                      <button onClick={() => setDatePickerYear(y => y - 1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <ChevronDown className="w-4 h-4 rotate-90" />
                      </button>
                      <span className="font-bold text-gray-700">{datePickerYear}</span>
                      <button onClick={() => setDatePickerYear(y => y + 1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
                        const isCurrentMonth = i === new Date().getMonth() && datePickerYear === new Date().getFullYear();
                        const isActive = i === currentDate.getMonth() && datePickerYear === currentDate.getFullYear();
                        return (
                          <button
                            key={m}
                            onClick={() => {
                              setCurrentDate(new Date(datePickerYear, i, 1));
                              setShowDatePicker(false);
                            }}
                            className={\`py-2 px-3 rounded-xl text-xs font-semibold transition-all \${isActive ? 'bg-emerald-600 text-white shadow-sm' : isCurrentMonth ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'text-gray-600 hover:bg-gray-100'}\`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => { setCurrentDate(new Date()); setShowDatePicker(false); }} className="w-full mt-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                      Go to Today
                    </button>
                  </div>
                )}`;

    content = content.replace(
        '<div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">\n                  <CalendarIcon className="w-6 h-6" />\n                </div>',
        datePickerUI
    );
}

fs.writeFileSync(appTsxPath, content);
console.log('App patched successfully.');
