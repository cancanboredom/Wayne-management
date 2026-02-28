/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  subDays,
  eachDayOfInterval,
  isWeekend,
  isToday
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Mic,
  Volume2,
  Search,
  Calendar as CalendarIcon,
  Users,
  Info,
  Settings2,
  ChevronDown,
  GripVertical,
  History,
  Save,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import Markdown from 'react-markdown';

// --- Types ---

interface Person {
  id: string;
  name: string;
  color: string;
  role: 'first' | 'others' | 'both';
  subset?: 'R' | 'All Calls' | 'None';
  unavailableDates?: string[];
  targetTotal?: number;
  targetHoliday?: number;
  targetWeekday?: number;
  group?: string;
}

type ShiftLevel = '1A' | '1B' | '2' | '3';

interface Shift {
  date: string; // YYYY-MM-DD format
  personId: string;
  level: ShiftLevel;
}

interface ScheduleVersion {
  id: string;
  timestamp: number;
  month: string;
  shifts: Shift[];
}

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

// --- Helpers ---
const parseLocal = (dateStr: string) => {
  if (!dateStr) return new Date();
  if (dateStr.includes('T')) return new Date(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// --- Thai Public Holidays (วันหยุดราชการไทย) ---
const THAI_HOLIDAYS: Holiday[] = [
  // 2025
  { date: '2025-01-01', name: 'วันขึ้นปีใหม่' },
  { date: '2025-02-12', name: 'วันมาฆบูชา' },
  { date: '2025-04-06', name: 'วันจักรี' },
  { date: '2025-04-13', name: 'วันสงกรานต์' },
  { date: '2025-04-14', name: 'วันสงกรานต์' },
  { date: '2025-04-15', name: 'วันสงกรานต์' },
  { date: '2025-05-01', name: 'วันแรงงาน' },
  { date: '2025-05-04', name: 'วันฉัตรมงคล' },
  { date: '2025-05-05', name: 'ชดเชยวันฉัตรมงคล' },
  { date: '2025-05-11', name: 'วันวิสาขบูชา' },
  { date: '2025-05-12', name: 'ชดเชยวันวิสาขบูชา' },
  { date: '2025-06-03', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2025-07-08', name: 'วันอาสาฬหบูชา' },
  { date: '2025-07-09', name: 'วันเข้าพรรษา' },
  { date: '2025-07-28', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2025-08-12', name: 'วันแม่แห่งชาติ' },
  { date: '2025-10-13', name: 'วันคล้ายวันสวรรคต ร.9' },
  { date: '2025-10-23', name: 'วันปิยมหาราช' },
  { date: '2025-12-05', name: 'วันพ่อแห่งชาติ' },
  { date: '2025-12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '2025-12-31', name: 'วันสิ้นปี' },
  // 2026
  { date: '2026-01-01', name: 'วันขึ้นปีใหม่' },
  { date: '2026-01-02', name: 'ชดเชยวันขึ้นปีใหม่' },
  { date: '2026-03-03', name: 'วันมาฆบูชา' },
  { date: '2026-04-06', name: 'วันจักรี' },
  { date: '2026-04-13', name: 'วันสงกรานต์' },
  { date: '2026-04-14', name: 'วันสงกรานต์' },
  { date: '2026-04-15', name: 'วันสงกรานต์' },
  { date: '2026-05-01', name: 'วันแรงงาน' },
  { date: '2026-05-04', name: 'วันฉัตรมงคล' },
  { date: '2026-05-31', name: 'วันวิสาขบูชา' },
  { date: '2026-06-01', name: 'ชดเชยวันวิสาขบูชา' },
  { date: '2026-06-03', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2026-06-28', name: 'วันอาสาฬหบูชา' },
  { date: '2026-06-29', name: 'วันเข้าพรรษา' },
  { date: '2026-07-28', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2026-08-12', name: 'วันแม่แห่งชาติ' },
  { date: '2026-10-13', name: 'วันคล้ายวันสวรรคต ร.9' },
  { date: '2026-10-23', name: 'วันปิยมหาราช' },
  { date: '2026-12-05', name: 'วันพ่อแห่งชาติ' },
  { date: '2026-12-07', name: 'ชดเชยวันพ่อแห่งชาติ' },
  { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '2026-12-31', name: 'วันสิ้นปี' },
  // 2027
  { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
  { date: '2027-02-19', name: 'วันมาฆบูชา' },
  { date: '2027-04-06', name: 'วันจักรี' },
  { date: '2027-04-13', name: 'วันสงกรานต์' },
  { date: '2027-04-14', name: 'วันสงกรานต์' },
  { date: '2027-04-15', name: 'วันสงกรานต์' },
  { date: '2027-05-03', name: 'ชดเชยวันแรงงาน' },
  { date: '2027-05-04', name: 'วันฉัตรมงคล' },
  { date: '2027-05-20', name: 'วันวิสาขบูชา' },
  { date: '2027-06-03', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2027-07-17', name: 'วันอาสาฬหบูชา' },
  { date: '2027-07-19', name: 'ชดเชยวันเข้าพรรษา' },
  { date: '2027-07-28', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2027-08-12', name: 'วันแม่แห่งชาติ' },
  { date: '2027-10-13', name: 'วันคล้ายวันสวรรคต ร.9' },
  { date: '2027-10-25', name: 'ชดเชยวันปิยมหาราช' },
  { date: '2027-12-06', name: 'ชดเชยวันพ่อแห่งชาติ' },
  { date: '2027-12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '2027-12-31', name: 'วันสิ้นปี' },
];

// --- Constants ---

const COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-teal-100 text-teal-700 border-teal-200',
];

// --- Components ---

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [people, setPeople] = useState<Person[]>([
    { id: '1', name: 'John Doe', color: COLORS[0], role: 'first' },
    { id: '2', name: 'Jane Smith', color: COLORS[1], role: 'others' },
  ]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [manualHighlights, setManualHighlights] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRole, setNewPersonRole] = useState<'first' | 'others' | 'both'>('first');
  const [newPersonSubset, setNewPersonSubset] = useState<'R' | 'All Calls' | 'None'>('None');
  const [restrictionPersonId, setRestrictionPersonId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({ first: true, others: true, both: true });
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [draggedPersonId, setDraggedPersonId] = useState<string | null>(null);

  // Noon selection feature
  const [noonDays, setNoonDays] = useState<string[]>([]);
  const [isSelectingNoon, setIsSelectingNoon] = useState(false);

  // Gemini States
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [viewMode, setViewMode] = useState<'calendar' | 'excel'>('calendar');

  // Password Protection States
  const [isExcelUnlocked, setIsExcelUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [firstCallCount, setFirstCallCount] = useState(2);

  const [appTitle, setAppTitle] = useState(() => {
    return localStorage.getItem('wayne-title') || 'Duty Management System';
  });
  const [versions, setVersions] = useState<ScheduleVersion[]>(() => {
    const saved = localStorage.getItem('wayne-versions');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Load data
  useEffect(() => {
    const savedPeople = localStorage.getItem('wayne_people');
    const savedShifts = localStorage.getItem('wayne_shifts');
    const savedManualHighlights = localStorage.getItem('wayne_manual_highlights');
    const savedNoonDays = localStorage.getItem('wayne_noon_days');

    if (savedPeople) {
      const parsed = JSON.parse(savedPeople);
      const migrated = parsed.map((p: any) => ({
        ...p,
        role: p.role || 'others'
      }));
      setPeople(migrated);
    }
    if (savedShifts) {
      const parsed = JSON.parse(savedShifts);
      const migrated = parsed.map((s: any) => {
        let dStr = s.date;
        if (dStr.includes('T')) {
          dStr = format(new Date(dStr), 'yyyy-MM-dd');
        }
        return { ...s, date: dStr };
      });
      setShifts(migrated);
    }
    if (savedManualHighlights) setManualHighlights(JSON.parse(savedManualHighlights));
    if (savedNoonDays) setNoonDays(JSON.parse(savedNoonDays));
  }, []);

  // Load Thai holidays
  useEffect(() => {
    // Start with built-in Thai holidays
    const allHolidays = [...THAI_HOLIDAYS];

    // Also try fetching from server (Google Calendar ICS) for additional holidays
    fetch('/api/holidays')
      .then(res => res.json())
      .then((serverHolidays: Holiday[]) => {
        if (Array.isArray(serverHolidays)) {
          for (const h of serverHolidays) {
            if (!allHolidays.some(existing => existing.date === h.date)) {
              allHolidays.push(h);
            }
          }
        }
        setHolidays(allHolidays);
      })
      .catch(() => {
        // Server unavailable, use built-in holidays only
        setHolidays(allHolidays);
      });
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('wayne_people', JSON.stringify(people));
    localStorage.setItem('wayne_shifts', JSON.stringify(shifts));
    localStorage.setItem('wayne_manual_highlights', JSON.stringify(manualHighlights));
    localStorage.setItem('wayne_noon_days', JSON.stringify(noonDays));
  }, [people, shifts, manualHighlights, noonDays]);

  useEffect(() => {
    localStorage.setItem('wayne-title', appTitle);
  }, [appTitle]);

  // Save Versions
  useEffect(() => {
    localStorage.setItem('wayne-versions', JSON.stringify(versions));
  }, [versions]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const addPerson = () => {
    if (!newPersonName.trim()) return;
    const newPerson: Person = {
      id: Math.random().toString(36).substr(2, 9),
      name: newPersonName,
      color: COLORS[people.length % COLORS.length],
      role: newPersonRole,
      subset: newPersonSubset,
    };
    setPeople([...people, newPerson]);
    setNewPersonName('');
    setNewPersonSubset('None');
    setIsAddingPerson(false);
  };

  const toggleManualHighlight = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    if (manualHighlights.includes(dateKey)) {
      setManualHighlights(manualHighlights.filter(d => d !== dateKey));
    } else {
      setManualHighlights([...manualHighlights, dateKey]);
    }
  };

  const removePerson = (id: string) => {
    setPeople(people.filter(p => p.id !== id));
    setShifts(shifts.filter(s => s.personId !== id));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedPersonId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedPersonId || draggedPersonId === targetId) return;

    const newPeople = [...people];
    const draggedIdx = newPeople.findIndex(p => p.id === draggedPersonId);
    const targetIdx = newPeople.findIndex(p => p.id === targetId);

    const [draggedItem] = newPeople.splice(draggedIdx, 1);
    newPeople.splice(targetIdx, 0, draggedItem);

    setPeople(newPeople);
    setDraggedPersonId(null);
  };

  const toggleExpand = (section: 'first' | 'others' | 'both') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const renderPersonRow = (person: Person) => {
    if (editingPersonId === person.id) {
      return (
        <div key={person.id} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 mb-2">
          <input
            type="text"
            value={person.name}
            onChange={(e) => setPeople(people.map(p => p.id === person.id ? { ...p, name: e.target.value } : p))}
            className="w-full px-2 py-1 text-sm rounded border focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="Name"
          />
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[8px] uppercase text-gray-500 font-bold">Total</label>
              <input type="number" min="0" value={person.targetTotal || ''} onChange={(e) => setPeople(people.map(p => p.id === person.id ? { ...p, targetTotal: parseInt(e.target.value) || undefined } : p))} className="w-full px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="-" />
            </div>
            <div>
              <label className="text-[8px] uppercase text-gray-500 font-bold">Holiday</label>
              <input type="number" min="0" value={person.targetHoliday || ''} onChange={(e) => setPeople(people.map(p => p.id === person.id ? { ...p, targetHoliday: parseInt(e.target.value) || undefined } : p))} className="w-full px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="-" />
            </div>
            <div>
              <label className="text-[8px] uppercase text-gray-500 font-bold">Weekday</label>
              <input type="number" min="0" value={person.targetWeekday || ''} onChange={(e) => setPeople(people.map(p => p.id === person.id ? { ...p, targetWeekday: parseInt(e.target.value) || undefined } : p))} className="w-full px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="-" />
            </div>
            <div>
              <label className="text-[8px] uppercase text-gray-500 font-bold">Group</label>
              <input type="text" value={person.group || ''} onChange={(e) => setPeople(people.map(p => p.id === person.id ? { ...p, group: e.target.value } : p))} className="w-full px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Subset" />
            </div>
          </div>
          <button onClick={() => setEditingPersonId(null)} className="w-full py-1.5 mt-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-bold transition-colors">Done</button>
        </div>
      );
    }

    return (
      <div
        key={person.id}
        draggable
        onDragStart={(e) => handleDragStart(e, person.id)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, person.id)}
        className={`flex items-center justify-between group p-1 -mx-1 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${draggedPersonId === person.id ? 'opacity-50 bg-gray-100' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-2">
          <GripVertical className={`w-3 h-3 text-gray-300 transition-opacity ${isExcelUnlocked ? 'opacity-0 group-hover:opacity-100 cursor-grab' : 'opacity-0'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${person.color}`}>
            {person.name.charAt(0)}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{person.name}</span>
              {(person.targetTotal || person.targetHoliday || person.targetWeekday) && (
                <span className="text-[8px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  {person.targetTotal ? `T:${person.targetTotal} ` : ''}
                  {person.targetHoliday ? `H:${person.targetHoliday} ` : ''}
                  {person.targetWeekday ? `W:${person.targetWeekday}` : ''}
                </span>
              )}
            </div>
            {person.unavailableDates && person.unavailableDates.filter(d => d.startsWith(format(currentDate, 'yyyy-MM'))).length > 0 && (
              <span className="text-[9px] text-red-500 font-medium mt-0.5">
                ไม่ว่าง: {person.unavailableDates.filter(d => d.startsWith(format(currentDate, 'yyyy-MM'))).map(d => format(parseLocal(d), 'd')).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 transition-all">
          <button
            onClick={() => setEditingPersonId(person.id)}
            className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded-lg"
            title="Edit Targets"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setRestrictionPersonId(restrictionPersonId === person.id ? null : person.id)}
            className={`p-1.5 rounded-lg transition-colors ${restrictionPersonId === person.id ? 'text-red-600 bg-red-50' : 'text-gray-400 hover:text-red-500'}`}
            title="Set Unavailable Dates"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => removePerson(person.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg"
            title="Remove Person"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderGroupedPeople = (roleFilter: 'first' | 'others' | 'both') => {
    const filtered = people.filter(p => p.role === roleFilter);
    const grouped = filtered.reduce((acc, p) => {
      const g = p.group || 'Ungrouped';
      if (!acc[g]) acc[g] = [];
      acc[g].push(p);
      return acc;
    }, {} as Record<string, Person[]>);

    return Object.entries(grouped).map(([groupName, groupPeople]) => (
      <div key={groupName} className="mb-2 last:mb-0">
        {groupName !== 'Ungrouped' && (
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1 bg-gray-50 inline-block rounded">{groupName}</div>
        )}
        <div className="space-y-1">
          {groupPeople.map(renderPersonRow)}
        </div>
      </div>
    ));
  };

  const toggleShift = (date: Date, personId: string, level: ShiftLevel) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const existingShift = shifts.find(s => s.date === dateStr && s.personId === personId && s.level === level);

    if (existingShift) {
      setShifts(shifts.filter(s => !(s.date === dateStr && s.personId === personId && s.level === level)));
    } else {
      // Check limits
      const shiftsOnDate = shifts.filter(s => s.date === dateStr);
      const levelCount = shiftsOnDate.filter(s => s.level === level).length;

      const limits = { '1A': 1, '1B': 1, '2': 1, '3': 1 };
      if (levelCount >= limits[level]) {
        alert(`Limit reached for ${level === '1A' ? '1st (เวรบน)' : level === '1B' ? '1st (เวรล่าง)' : level === '2' ? '2nd' : '3rd'} call.`);
        return;
      }

      // Prevent same person on 1A and 1B
      if ((level === '1A' || level === '1B') && shiftsOnDate.some(s => (s.level === '1A' || s.level === '1B') && s.personId === personId)) {
        alert('A person cannot be assigned to both เวรบน and เวรล่าง on the same day.');
        return;
      }

      setShifts([...shifts, { date: dateStr, personId, level }]);
    }
  };

  const updateShift = (date: Date, level: ShiftLevel, oldPersonId: string | undefined, newPersonId: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    let updatedShifts = [...shifts];

    if (oldPersonId) {
      const indexToRemove = updatedShifts.findIndex(s => s.date === dateStr && s.level === level && s.personId === oldPersonId);
      if (indexToRemove !== -1) {
        updatedShifts.splice(indexToRemove, 1);
      }
    }

    if (newPersonId) {
      // Prevent same person on 1A and 1B
      if (level === '1A' || level === '1B') {
        const otherLevel = level === '1A' ? '1B' : '1A';
        const hasOther = updatedShifts.some(s => s.date === dateStr && s.level === otherLevel && s.personId === newPersonId);
        if (hasOther) {
          alert('A person cannot be assigned to both เวรบน and เวรล่าง on the same day.');
          return;
        }
      }

      const alreadyAssigned = updatedShifts.some(s => s.date === dateStr && s.level === level && s.personId === newPersonId);
      if (!alreadyAssigned) {
        updatedShifts.push({ date: dateStr, personId: newPersonId, level });
      }
    }

    setShifts(updatedShifts);
  };

  const generateSchedule = () => {
    if (!confirm('Auto-generate will fill only empty slots. Proceed?')) return;

    const monthStr = format(currentDate, 'yyyy-MM');
    let currentMonthShifts = [...shifts];

    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const counts: Record<string, { total: number, hol: number, wk: number }> = {};
    people.forEach(p => counts[p.id] = { total: 0, hol: 0, wk: 0 });

    currentMonthShifts.filter(s => s.date.startsWith(monthStr)).forEach(s => {
      const isHol = isWeekend(parseLocal(s.date)) || holidays.some(h => h.date === s.date) || manualHighlights.includes(s.date);
      if (counts[s.personId]) {
        counts[s.personId].total++;
        if (isHol) counts[s.personId].hol++;
        else counts[s.personId].wk++;
      }
    });

    daysInMonth.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const isHol = isWeekend(day) || holidays.some(h => h.date === dateStr) || manualHighlights.includes(dateStr);

      const slots = [
        { level: '2' as ShiftLevel, role: 'others' as const },
        { level: '3' as ShiftLevel, role: 'others' as const },
        ...Array.from({ length: firstCallCount }).map((_, i) => ({
          level: `1${String.fromCharCode(65 + i)}` as ShiftLevel, role: 'first' as const
        }))
      ];

      slots.forEach(slot => {
        const existing = currentMonthShifts.find(s => s.date === dateStr && s.level === slot.level);
        if (existing) return;

        const eligible = people.filter(person => {
          if (slot.role === 'first' && person.role === 'others') return false;
          if (slot.role === 'others' && person.role === 'first') return false;
          if (person.unavailableDates?.includes(dateStr)) return false;

          if (person.targetTotal !== undefined && person.targetTotal > 0 && counts[person.id].total >= person.targetTotal) return false;
          if (isHol && person.targetHoliday !== undefined && person.targetHoliday > 0 && counts[person.id].hol >= person.targetHoliday) return false;
          if (!isHol && person.targetWeekday !== undefined && person.targetWeekday > 0 && counts[person.id].wk >= person.targetWeekday) return false;

          if (currentMonthShifts.some(s => s.date === dateStr && s.personId === person.id)) return false;

          const dMinus1 = format(subDays(day, 1), 'yyyy-MM-dd');
          const dPlus1 = format(addDays(day, 1), 'yyyy-MM-dd');
          if (currentMonthShifts.some(s => s.personId === person.id && (s.date === dMinus1 || s.date === dPlus1))) return false;

          // Group constraint: R vs All Calls
          const pGroup = (person.group || '').toLowerCase().trim();
          if (slot.level.startsWith('1')) {
            if (pGroup === 'r') {
              const secondCall = currentMonthShifts.find(s => s.date === dateStr && s.level === '2');
              if (secondCall) {
                const secondCallPerson = people.find(p => p.id === secondCall.personId);
                if (secondCallPerson && (secondCallPerson.group || '').toLowerCase().trim() === 'all calls') {
                  return false;
                }
              }
            }
          } else if (slot.level === '2') {
            if (pGroup === 'all calls') {
              const firstCalls = currentMonthShifts.filter(s => s.date === dateStr && s.level.startsWith('1'));
              for (const fc of firstCalls) {
                const fcPerson = people.find(p => p.id === fc.personId);
                if (fcPerson && (fcPerson.group || '').toLowerCase().trim() === 'r') {
                  return false;
                }
              }
            }
          }

          return true;
        });

        if (eligible.length > 0) {
          let bestCandidates = eligible.filter(person => {
            const dMinus2 = format(subDays(day, 2), 'yyyy-MM-dd');
            const dPlus2 = format(addDays(day, 2), 'yyyy-MM-dd');
            return !currentMonthShifts.some(s => s.personId === person.id && (s.date === dMinus2 || s.date === dPlus2));
          });

          if (bestCandidates.length === 0) bestCandidates = eligible;

          bestCandidates.sort((a, b) => {
            // Respect target totals if set
            if (a.targetTotal || b.targetTotal) {
              const aNeed = a.targetTotal ? (a.targetTotal - counts[a.id].total) : -counts[a.id].total;
              const bNeed = b.targetTotal ? (b.targetTotal - counts[b.id].total) : -counts[b.id].total;
              if (aNeed !== bNeed) return bNeed - aNeed;
            }

            // Balance based on day type (holiday vs weekday)
            if (isHol) {
              if (counts[a.id].hol !== counts[b.id].hol) {
                return counts[a.id].hol - counts[b.id].hol;
              }
            } else {
              if (counts[a.id].wk !== counts[b.id].wk) {
                return counts[a.id].wk - counts[b.id].wk;
              }
            }

            // Fallback to total shifts
            return counts[a.id].total - counts[b.id].total;
          });

          const selected = bestCandidates[0];
          currentMonthShifts.push({ date: dateStr, personId: selected.id, level: slot.level });
          counts[selected.id].total++;
          if (isHol) counts[selected.id].hol++;
          else counts[selected.id].wk++;
        }
      });
    });

    setShifts(currentMonthShifts);
  };

  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => s.date === dateStr);
  };

  // --- Gemini Integrations ---

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    setImportProgress(0);

    const progressInterval = setInterval(() => {
      setImportProgress(p => p < 90 ? p + 5 : p);
    }, 500);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];

        try {
          const response = await fetch('/api/smart-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64Data,
              mimeType: file.type,
              currentDateStr: format(currentDate, 'MMMM yyyy'),
              people: people.map(p => ({ id: p.id, name: p.name }))
            })
          });

          if (!response.ok) {
            throw new Error('Failed to import schedule');
          }

          const data = await response.json();
          const extractedShifts = data.shifts || [];

          if (Array.isArray(extractedShifts)) {
            const validShifts = extractedShifts.filter(s => s.date && s.personId && ['1A', '1B', '2', '3'].includes(s.level));
            setShifts(prev => {
              const newShifts = [...prev];
              validShifts.forEach(vs => {
                const idx = newShifts.findIndex(s => s.date === vs.date && s.level === vs.level);
                if (idx >= 0) newShifts.splice(idx, 1);
                newShifts.push(vs);
              });
              return newShifts;
            });
            clearInterval(progressInterval);
            setImportProgress(100);
            setTimeout(() => {
              alert(`Successfully imported ${validShifts.length} shifts!`);
              setIsUploadingImage(false);
              setImportProgress(0);
            }, 300);
          }
        } catch (error) {
          console.error("Failed to parse JSON:", error);
          clearInterval(progressInterval);
          alert("Failed to read schedule from image.");
          setIsUploadingImage(false);
          setImportProgress(0);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      clearInterval(progressInterval);
      alert("Failed to read schedule from image.");
      setIsUploadingImage(false);
      setImportProgress(0);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans p-4 md:p-8">
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: white !important;
          }
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
          .print-page {
            page-break-after: always;
            break-after: page;
            height: 100vh;
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          @media print {
            .duty-summary-container {
              transform: scale(0.9);
              transform-origin: top left;
              width: 110%;
            }
          }
        }
      `}</style>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 print:block print:max-w-none print:m-0 print:p-0">

        {/* Sidebar: Controls & People */}
        <div className="lg:col-span-4 space-y-6 print:hidden">
          <header className="space-y-1">
            <input
              value={appTitle}
              onChange={(e) => setAppTitle(e.target.value)}
              className="text-4xl font-light tracking-tight bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded px-2 -ml-2 w-full"
            />
            <p className="text-sm text-gray-500 uppercase tracking-widest font-medium px-2">Duty Management System</p>
          </header>

          {/* Smart Import */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <CalendarIcon className="w-3 h-3" /> Smart Import
            </h2>
            <div className="flex flex-col gap-3">
              <label className={`flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl transition-colors text-[10px] font-bold uppercase tracking-wider border border-gray-100 relative overflow-hidden ${isExcelUnlocked ? 'bg-gray-50 hover:bg-gray-100 cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploadingImage || !isExcelUnlocked} />
                {isUploadingImage && (
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-500"
                    style={{ width: `${importProgress}%` }}
                  />
                )}
                {isUploadingImage ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
                ) : (
                  <Plus className="w-5 h-5 text-emerald-600" />
                )}
                {isUploadingImage ? `Analyzing Image... ${importProgress}%` : 'Upload Schedule Image'}
              </label>
              <p className="text-[9px] text-gray-400 text-center">Upload an image of a schedule to auto-fill shifts.</p>
            </div>
          </div>

          {/* People List */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Users className="w-3 h-3" /> Personnel
              </h2>
              <button
                disabled={!isExcelUnlocked}
                onClick={() => setIsAddingPerson(true)}
                className={`p-2 rounded-full transition-colors ${isExcelUnlocked ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* First Call Section */}
              <div className="space-y-2">
                <div
                  className="flex items-center justify-between cursor-pointer border-b border-emerald-50 pb-1 group"
                  onClick={() => toggleExpand('first')}
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">First Call Personnel</h3>
                  <ChevronDown className={`w-4 h-4 text-emerald-600 transition-transform ${expandedSections.first ? '' : '-rotate-90'}`} />
                </div>
                <AnimatePresence>
                  {expandedSections.first && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 overflow-hidden">
                      {renderGroupedPeople('first')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Others Section */}
              <div className="space-y-2">
                <div
                  className="flex items-center justify-between cursor-pointer border-b border-amber-50 pb-1 group"
                  onClick={() => toggleExpand('others')}
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Second & Third Call</h3>
                  <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform ${expandedSections.others ? '' : '-rotate-90'}`} />
                </div>
                <AnimatePresence>
                  {expandedSections.others && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 overflow-hidden">
                      {renderGroupedPeople('others')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Both Section */}
              <div className="space-y-2">
                <div
                  className="flex items-center justify-between cursor-pointer border-b border-blue-50 pb-1 group"
                  onClick={() => toggleExpand('both')}
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-600">All Calls (Both)</h3>
                  <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${expandedSections.both ? '' : '-rotate-90'}`} />
                </div>
                <AnimatePresence>
                  {expandedSections.both && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 overflow-hidden">
                      {renderGroupedPeople('both')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {isAddingPerson && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="pt-4 border-t border-gray-100"
                >
                  <div className="space-y-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Enter name..."
                      value={newPersonName}
                      onChange={(e) => setNewPersonName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                      className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 border border-gray-100"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNewPersonRole('first')}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all ${newPersonRole === 'first' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-100 text-gray-400'}`}
                      >
                        First Call
                      </button>
                      <button
                        onClick={() => setNewPersonRole('others')}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all ${newPersonRole === 'others' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-100 text-gray-400'}`}
                      >
                        2nd & 3rd Call
                      </button>
                      <button
                        onClick={() => setNewPersonRole('both')}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all ${newPersonRole === 'both' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-100 text-gray-400'}`}
                      >
                        Both
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={addPerson} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">Add</button>
                    <button onClick={() => setIsAddingPerson(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors">Cancel</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Main Content: Calendar */}
        <div className="lg:col-span-8 space-y-6 print:w-full print:space-y-8">
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-black/5 print:border-none print:shadow-none print:p-0">
            <div className="flex items-center justify-between mb-8 print:mb-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl print:hidden">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold capitalize">{format(currentDate, 'MMMM yyyy')}</h2>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Year 2569 BE</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden items-center justify-end max-w-[70%]">
                <button
                  disabled={!isExcelUnlocked}
                  onClick={() => setShowHistoryModal(true)}
                  className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors px-2 py-1.5 rounded-lg ${isExcelUnlocked ? 'text-blue-600 hover:text-blue-700 bg-blue-50' : 'text-gray-400 bg-gray-100 cursor-not-allowed'}`}
                >
                  <History className="w-3 h-3" /> History
                </button>
                <button
                  disabled={!isExcelUnlocked}
                  onClick={() => {
                    const monthStr = format(currentDate, 'yyyy-MM');
                    const monthShifts = shifts.filter(s => s.date.startsWith(monthStr));
                    const newVersion: ScheduleVersion = {
                      id: Date.now().toString(),
                      timestamp: Date.now(),
                      month: monthStr,
                      shifts: monthShifts
                    };
                    setVersions([...versions, newVersion]);
                    alert('Schedule saved successfully!');
                  }}
                  className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors px-2 py-1.5 rounded-lg ${isExcelUnlocked ? 'text-emerald-600 hover:text-emerald-700 bg-emerald-50' : 'text-gray-400 bg-gray-100 cursor-not-allowed'}`}
                >
                  <Save className="w-3 h-3" /> Save
                </button>
                <button
                  onClick={() => window.print()}
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-900 transition-colors px-2 py-1.5 bg-gray-100 rounded-lg"
                >
                  Export PDF
                </button>
                <button
                  disabled={!isExcelUnlocked}
                  onClick={generateSchedule}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors px-3 py-1.5 rounded-lg shadow-sm ${isExcelUnlocked ? 'text-white bg-emerald-600 hover:bg-emerald-700' : 'text-gray-400 bg-gray-200 cursor-not-allowed'}`}
                >
                  Auto-Generate
                </button>
                <button
                  onClick={() => setViewMode(viewMode === 'calendar' ? 'excel' : 'calendar')}
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-900 transition-colors px-2 py-1.5 bg-gray-100 rounded-lg ml-2"
                >
                  {viewMode === 'calendar' ? 'Excel View' : 'Calendar View'}
                </button>
                <button
                  disabled={!isExcelUnlocked}
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all shifts for this entire month? This action cannot be undone.')) {
                      const monthStr = format(currentDate, 'yyyy-MM');
                      setShifts(shifts.filter(s => !s.date.startsWith(monthStr)));
                    }
                  }}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors px-2 py-1.5 rounded-lg ${isExcelUnlocked ? 'text-red-600 hover:text-red-700 bg-red-50' : 'text-gray-400 bg-gray-100 cursor-not-allowed'}`}
                >
                  Clear Month
                </button>
                <button
                  disabled={!isExcelUnlocked}
                  onClick={() => {
                    setIsSelectingNoon(!isSelectingNoon);
                    setRestrictionPersonId(null);
                  }}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-all px-2 py-1.5 rounded-lg ml-2 ${!isExcelUnlocked
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isSelectingNoon
                      ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-400'
                      : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 hover:ring-1 hover:ring-yellow-300'
                    }`}
                >
                  {isSelectingNoon ? 'Done Noon' : 'Select Noon'}
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={prevMonth} className="p-2 hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={nextMonth} className="p-2 hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Restriction & Noon Banner */}
            {restrictionPersonId && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between print:hidden">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-sm font-medium text-red-800">
                    Setting unavailable dates for <strong>{people.find(p => p.id === restrictionPersonId)?.name}</strong>. Click days on the calendar to toggle.
                  </span>
                </div>
                <button
                  onClick={() => setRestrictionPersonId(null)}
                  className="text-xs font-bold uppercase tracking-widest text-red-600 hover:text-red-800"
                >
                  Done
                </button>
              </div>
            )}

            {isSelectingNoon && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between print:hidden">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <span className="text-sm font-medium text-amber-800">
                    Select <strong>Noon Days</strong> on the calendar view.
                  </span>
                </div>
                <button
                  onClick={() => setIsSelectingNoon(false)}
                  className="text-xs font-bold uppercase tracking-widest text-amber-600 hover:text-amber-800"
                >
                  Done
                </button>
              </div>
            )}

            {/* Excel View (Prints First) */}
            <div className={`print:block print-page ${viewMode === 'excel' ? 'block' : 'hidden'}`}>
              <div className="flex justify-between items-center mb-4 print:hidden">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Spreadsheet View</h3>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">1st Call Columns:</span>
                    <button
                      disabled={!isExcelUnlocked || firstCallCount <= 1}
                      onClick={() => setFirstCallCount(prev => Math.max(1, prev - 1))}
                      className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >-</button>
                    <span className="text-xs font-bold w-4 text-center">{firstCallCount}</span>
                    <button
                      disabled={!isExcelUnlocked || firstCallCount >= 5}
                      onClick={() => setFirstCallCount(prev => Math.min(5, prev + 1))}
                      className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >+</button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isExcelUnlocked) {
                      setIsExcelUnlocked(false);
                    } else {
                      setShowPasswordModal(true);
                    }
                  }}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${isExcelUnlocked ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {isExcelUnlocked ? '🔓 Editing Unlocked' : '🔒 Unlock to Edit'}
                </button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-gray-100 print:border-none print:overflow-visible">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="p-4 print:p-1 print:text-[8px] text-[10px] font-bold uppercase tracking-widest text-gray-400 border-r border-gray-100 sticky left-0 bg-gray-50 z-20 print:static print:bg-transparent">Date</th>
                      {Array.from({ length: firstCallCount }).map((_, i) => (
                        <th key={`1st-${i}`} className="p-4 print:p-1 print:text-[8px] text-[10px] font-bold uppercase tracking-widest text-emerald-600 text-center min-w-[120px] print:min-w-0">
                          1st Call ({String.fromCharCode(65 + i)})
                        </th>
                      ))}
                      <th className="p-4 print:p-1 print:text-[8px] text-[10px] font-bold uppercase tracking-widest text-amber-600 text-center min-w-[120px] print:min-w-0 bg-amber-50/50">2nd Call</th>
                      <th className="p-4 print:p-1 print:text-[8px] text-[10px] font-bold uppercase tracking-widest text-blue-600 text-center min-w-[120px] print:min-w-0 bg-blue-50/50">3rd Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eachDayOfInterval({ start: monthStart, end: monthEnd }).map((day, idx) => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const holiday = holidays.find(h => h.date === dateKey);
                      const isWeekendDay = isWeekend(day);
                      const isManualHighlight = manualHighlights.includes(dateKey);
                      const isHighlight = !!holiday || isWeekendDay || isManualHighlight;
                      const isTodayDay = isToday(day);
                      const dayShifts = getShiftsForDate(day);

                      const secondCallShift = dayShifts.find(s => s.level === '2');
                      const thirdCallShift = dayShifts.find(s => s.level === '3');

                      const renderSelect = (level: ShiftLevel, currentShift: Shift | undefined, roleFilter: 'first' | 'others' | 'all') => {
                        const availablePeople = people.filter(p => roleFilter === 'all' || p.role === roleFilter || p.role === 'both');
                        const currentPerson = people.find(p => p.id === currentShift?.personId);
                        return (
                          <>
                            <select
                              disabled={!isExcelUnlocked}
                              value={currentShift?.personId || ''}
                              onChange={(e) => updateShift(day, level, currentShift?.personId, e.target.value)}
                              className={`w-full p-2 print:p-0.5 text-sm print:text-[8px] bg-transparent border-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg cursor-pointer text-center font-medium print:hidden ${currentShift?.personId === 'LOCKED' ? 'text-gray-400' : ''} ${!isExcelUnlocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              <option value="">-</option>
                              <option value="LOCKED">🔒 Locked</option>
                              {availablePeople.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <div className="hidden print:block text-center text-[8px] font-medium p-0.5">
                              {currentShift?.personId === 'LOCKED' ? '🔒' : (currentPerson ? currentPerson.name : '-')}
                            </div>
                          </>
                        );
                      };

                      return (
                        <tr
                          key={idx}
                          className={`
                            border-b border-gray-50 hover:bg-gray-50/50 transition-colors
                            ${isHighlight ? 'bg-[#e6f4ea]' : ''}
                            ${isTodayDay ? 'bg-emerald-100' : ''}
                          `}
                        >
                          <td className={`
                            p-4 print:p-1 text-sm print:text-[8px] font-medium border-r border-gray-100 sticky left-0 z-10 print:static print:bg-transparent
                            ${isHighlight ? 'bg-[#e6f4ea]' : 'bg-white'}
                            ${isTodayDay ? 'text-emerald-700 font-bold' : ''}
                          `}>
                            <div className="flex flex-col relative group/date">
                              <div className="flex justify-between items-start">
                                <span>{format(day, 'EEE, d MMM')}</span>
                                <button
                                  disabled={!isExcelUnlocked}
                                  onClick={() => {
                                    if (isManualHighlight) {
                                      setManualHighlights(manualHighlights.filter(d => d !== dateKey));
                                    } else {
                                      setManualHighlights([...manualHighlights, dateKey]);
                                    }
                                  }}
                                  className={`opacity-0 group-hover/date:opacity-100 transition-opacity p-1 rounded print:hidden ${isExcelUnlocked ? 'hover:bg-black/5' : 'cursor-not-allowed'}`}
                                >
                                  <CalendarIcon className="w-3 h-3 text-gray-400" />
                                </button>
                              </div>
                              {holiday && <span className="text-[10px] print:text-[6px] text-emerald-600 font-bold mt-1">{holiday.name}</span>}
                            </div>
                          </td>
                          {Array.from({ length: firstCallCount }).map((_, i) => {
                            const level = `1${String.fromCharCode(65 + i)}` as ShiftLevel;
                            const shift = dayShifts.find(s => s.level === level);
                            return (
                              <td key={`1st-${i}`} className="p-2 print:p-0.5 border-r border-gray-50">
                                {renderSelect(level, shift, 'first')}
                              </td>
                            );
                          })}
                          <td className="p-2 print:p-0.5 border-r border-gray-50 bg-amber-50/30">{renderSelect('2', secondCallShift, 'others')}</td>
                          <td className="p-2 print:p-0.5 bg-blue-50/30">{renderSelect('3', thirdCallShift, 'others')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calendar View (Prints Second) */}
            <div className={`print:block print-page ${viewMode === 'calendar' ? 'block' : 'hidden'}`}>
              <div className="flex justify-between items-center mb-4 print:hidden">
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Calendar View</h3>
                <button
                  onClick={() => {
                    if (isExcelUnlocked) {
                      setIsExcelUnlocked(false);
                    } else {
                      setShowPasswordModal(true);
                    }
                  }}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${isExcelUnlocked ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {isExcelUnlocked ? '🔓 Editing Unlocked' : '🔒 Unlock to Edit'}
                </button>
              </div>
              <div className="grid grid-cols-7 gap-[2px] bg-gray-200/60 rounded-2xl overflow-hidden border border-gray-200">
                {/* Day Headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, i) => (
                  <div
                    key={dayName}
                    className={`py-2.5 text-center text-[10px] font-bold uppercase tracking-widest ${i === 0 || i === 6 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'
                      }`}
                  >
                    {dayName}
                  </div>
                ))}

                {/* Calendar Days */}
                {calendarDays.map((day, idx) => {
                  const dayShifts = getShiftsForDate(day);
                  const isCurrentMonth = isSameMonth(day, monthStart);
                  const isWeekendDay = isWeekend(day);
                  const isTodayDay = isToday(day);
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const holiday = holidays.find(h => h.date === dateKey);
                  const isHoliday = !!holiday;
                  const isManualHighlight = manualHighlights.includes(dateKey);
                  const isHighlight = isHoliday || isWeekendDay || isManualHighlight;
                  const isUnavailable = restrictionPersonId && people.find(p => p.id === restrictionPersonId)?.unavailableDates?.includes(dateKey);
                  const isNoon = noonDays.includes(dateKey);

                  // Get assigned people for each level
                  const firstCallShifts = Array.from({ length: firstCallCount }).map((_, i) => {
                    const lvl = `1${String.fromCharCode(65 + i)}` as ShiftLevel;
                    const shift = dayShifts.find(s => s.level === lvl);
                    const person = shift ? people.find(p => p.id === shift.personId) : null;
                    return { level: lvl, shift, person, label: `1st(${String.fromCharCode(65 + i)})` };
                  });
                  const secondCallShift = dayShifts.find(s => s.level === '2');
                  const secondCallPerson = secondCallShift ? people.find(p => p.id === secondCallShift.personId) : null;
                  const thirdCallShift = dayShifts.find(s => s.level === '3');
                  const thirdCallPerson = thirdCallShift ? people.find(p => p.id === thirdCallShift.personId) : null;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!isExcelUnlocked) return;
                        if (isSelectingNoon) {
                          if (noonDays.includes(dateKey)) {
                            setNoonDays(noonDays.filter(d => d !== dateKey));
                          } else {
                            setNoonDays([...noonDays, dateKey]);
                          }
                          return;
                        }
                        if (restrictionPersonId) {
                          setPeople(people.map(p => {
                            if (p.id === restrictionPersonId) {
                              const unavail = p.unavailableDates || [];
                              if (unavail.includes(dateKey)) {
                                return { ...p, unavailableDates: unavail.filter(d => d !== dateKey) };
                              } else {
                                return { ...p, unavailableDates: [...unavail, dateKey] };
                              }
                            }
                            return p;
                          }));
                        }
                      }}
                      className={`
                        min-h-[140px] print:min-h-[50px] p-1.5 print:p-0.5 transition-all cursor-pointer relative flex flex-col
                        ${!isCurrentMonth ? 'opacity-30' : ''}
                        ${isUnavailable
                          ? 'bg-red-50 ring-2 ring-red-400 ring-inset'
                          : isHighlight
                            ? 'bg-[#e6f4ea]'
                            : 'bg-white'
                        }
                        ${isTodayDay ? 'ring-2 ring-emerald-500 ring-inset z-10 shadow-md shadow-emerald-100' : ''}
                        hover:brightness-[0.97]
                      `}
                    >
                      {/* Date Number + Holiday/Noon badges */}
                      <div className="flex items-start justify-between mb-1">
                        <span className={`
                          text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full leading-none
                          ${isTodayDay
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : isHighlight
                              ? 'text-emerald-800'
                              : 'text-gray-700'
                          }
                        `}>
                          {format(day, 'd')}
                        </span>
                        <div className="flex flex-col items-end gap-0.5">
                          {holiday && (
                            <span className="text-[7px] print:text-[5px] bg-emerald-100 text-emerald-700 px-1 py-px rounded font-bold leading-tight max-w-[65px] text-right truncate" title={holiday.name}>
                              {holiday.name}
                            </span>
                          )}
                          {isNoon && (
                            <span className="text-[7px] print:text-[5px] bg-amber-100 text-amber-700 px-1 py-px rounded font-bold uppercase tracking-wider">
                              Noon
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Personnel assignments */}
                      <div className="flex-1 flex flex-col gap-[3px] mt-0.5">
                        {firstCallShifts.map(({ level, shift, person, label }) => {
                          if (!shift) return null;
                          if (shift.personId === 'LOCKED') {
                            return (
                              <div key={level} className="flex items-center gap-1">
                                <span className="text-[7px] print:text-[5px] font-bold text-emerald-500 uppercase w-[32px] shrink-0">{label}</span>
                                <span className="text-[8px] print:text-[5px] px-1.5 py-[1px] rounded bg-gray-100 text-gray-400 font-medium truncate flex-1 text-center">🔒</span>
                              </div>
                            );
                          }
                          return (
                            <div key={level} className="flex items-center gap-1">
                              <span className="text-[7px] print:text-[5px] font-bold text-emerald-500 uppercase w-[32px] shrink-0">{label}</span>
                              <span className={`text-[8px] print:text-[5px] px-1.5 py-[1px] rounded font-semibold truncate flex-1 text-center border ${person?.color || 'bg-gray-100 text-gray-500'}`}>
                                {person?.name || '-'}
                              </span>
                            </div>
                          );
                        })}

                        {secondCallShift && (
                          <div className="flex items-center gap-1">
                            <span className="text-[7px] print:text-[5px] font-bold text-amber-500 uppercase w-[32px] shrink-0">2nd</span>
                            {secondCallShift.personId === 'LOCKED' ? (
                              <span className="text-[8px] print:text-[5px] px-1.5 py-[1px] rounded bg-gray-100 text-gray-400 font-medium truncate flex-1 text-center">🔒</span>
                            ) : (
                              <span className={`text-[8px] print:text-[5px] px-1.5 py-[1px] rounded font-semibold truncate flex-1 text-center border ${secondCallPerson?.color || 'bg-gray-100 text-gray-500'}`}>
                                {secondCallPerson?.name || '-'}
                              </span>
                            )}
                          </div>
                        )}

                        {thirdCallShift && (
                          <div className="flex items-center gap-1">
                            <span className="text-[7px] print:text-[5px] font-bold text-blue-500 uppercase w-[32px] shrink-0">3rd</span>
                            {thirdCallShift.personId === 'LOCKED' ? (
                              <span className="text-[8px] print:text-[5px] px-1.5 py-[1px] rounded bg-gray-100 text-gray-400 font-medium truncate flex-1 text-center">🔒</span>
                            ) : (
                              <span className={`text-[8px] print:text-[5px] px-1.5 py-[1px] rounded font-semibold truncate flex-1 text-center border ${thirdCallPerson?.color || 'bg-gray-100 text-gray-500'}`}>
                                {thirdCallPerson?.name || '-'}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Empty state for days with no assignments */}
                        {dayShifts.length === 0 && isCurrentMonth && (
                          <div className="flex-1 flex items-center justify-center">
                            <span className="text-[8px] text-gray-300 font-medium">—</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary Table */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-black/5 print-page print:border-none print:shadow-none print:p-0 duty-summary-container">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" /> Duty Summary (Current Month)
            </h2>

            {['first', 'others', 'both'].map(role => {
              const rolePeople = people.filter(p => p.role === role);
              if (rolePeople.length === 0) return null;

              const title = role === 'first' ? 'First Call Team' : role === 'others' ? '2nd/3rd Call Team' : 'Both Roles';

              return (
                <div key={role} className="mb-8">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">{title}</h3>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">Personnel</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 text-center">1st Call</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 text-center">2nd Call</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 text-center">3rd Call</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-gray-700 bg-amber-100 text-center">Noon</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-blue-700 bg-blue-50 text-center">Weekday</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-rose-700 bg-rose-50 text-center">Holiday</th>
                          <th className="px-3 py-2 print:py-1 print:px-1 text-[10px] print:text-[8px] font-bold uppercase tracking-widest text-gray-700 bg-gray-100 text-center">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rolePeople.map(person => {
                          const monthStr = format(currentDate, 'yyyy-MM');
                          const personMonthShifts = shifts.filter(s => s.personId === person.id && s.date.startsWith(monthStr));
                          const c1 = personMonthShifts.filter(s => s.level.startsWith('1')).length;
                          const c2 = personMonthShifts.filter(s => s.level === '2').length;
                          const c3 = personMonthShifts.filter(s => s.level === '3').length;
                          const total = personMonthShifts.length;

                          let holidayCount = 0;
                          let weekdayCount = 0;
                          let noonCount = 0;
                          let potentialNoonCount = 0;
                          personMonthShifts.forEach(s => {
                            const isWknd = isWeekend(parseLocal(s.date));
                            const isHol = holidays.some(h => h.date === s.date);
                            const isManual = manualHighlights.includes(s.date);
                            if (isWknd || isHol || isManual) holidayCount++;
                            else weekdayCount++;

                            if (noonDays.includes(s.date)) {
                              if (s.level === '2') noonCount++;
                              else if (s.level.startsWith('1')) potentialNoonCount++;
                            }
                          });

                          return (
                            <tr key={person.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                              <td className="px-3 py-2 print:py-1 print:px-1">
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 print:w-4 print:h-4 rounded-full flex items-center justify-center text-[10px] print:text-[8px] font-bold ${person.color}`}>
                                    {person.name.charAt(0)}
                                  </div>
                                  <span className="text-xs print:text-[8px] font-medium">{person.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-mono text-xs print:text-[8px] bg-emerald-50/30">{c1 > 0 ? c1 : '-'}</td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-mono text-xs print:text-[8px] bg-amber-50/30">{c2 > 0 ? c2 : '-'}</td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-mono text-xs print:text-[8px] bg-amber-50/30">{c3 > 0 ? c3 : '-'}</td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-mono text-xs print:text-[8px] bg-amber-100/40">
                                {noonCount > 0 ? noonCount : ''}
                                {noonCount > 0 && potentialNoonCount > 0 ? ' ' : ''}
                                {potentialNoonCount > 0 ? `(${potentialNoonCount})` : ''}
                                {noonCount === 0 && potentialNoonCount === 0 ? '-' : ''}
                              </td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-mono text-xs print:text-[8px] bg-blue-50/30">{weekdayCount > 0 ? weekdayCount : '-'}</td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-mono text-xs print:text-[8px] bg-rose-50/30">{holidayCount > 0 ? holidayCount : '-'}</td>
                              <td className="px-3 py-2 print:py-1 print:px-1 text-center font-bold text-gray-700 font-mono text-xs print:text-[8px] bg-gray-50/50">{total > 0 ? total : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Conflicts & Warnings Report */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-black/5 print:hidden">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-rose-600">
              <Info className="w-5 h-5" /> Schedule Conflicts & Warnings
            </h2>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">Personnel</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-700 bg-rose-50">Consecutive (ติดกัน)</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50">1-Day Gap (วันเว้นวัน)</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-700 bg-red-50">Restrictions (ตรงวันไม่ว่าง)</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(person => {
                    const monthStr = format(currentDate, 'yyyy-MM');
                    const personMonthShifts = shifts
                      .filter(s => s.personId === person.id && s.date.startsWith(monthStr))
                      .sort((a, b) => a.date.localeCompare(b.date));

                    const consecutive: string[] = [];
                    const oneDayGap: string[] = [];
                    const violations: string[] = [];

                    personMonthShifts.forEach((s, i) => {
                      if (person.unavailableDates?.includes(s.date)) {
                        violations.push(format(parseLocal(s.date), 'd MMM'));
                      }
                      if (i < personMonthShifts.length - 1) {
                        const d1 = parseLocal(s.date);
                        const d2 = parseLocal(personMonthShifts[i + 1].date);
                        const diffTime = Math.abs(d2.getTime() - d1.getTime());
                        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays === 1) {
                          consecutive.push(`${format(d1, 'd')}-${format(d2, 'd MMM')}`);
                        } else if (diffDays === 2) {
                          oneDayGap.push(`${format(d1, 'd')}, ${format(d2, 'd MMM')}`);
                        }
                      }
                    });

                    if (consecutive.length === 0 && oneDayGap.length === 0 && violations.length === 0) return null;

                    return (
                      <tr key={person.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${person.color}`}>
                              {person.name.charAt(0)}
                            </div>
                            <span className="text-xs font-medium">{person.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50/30">
                          {consecutive.length > 0 ? consecutive.join(' | ') : '-'}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50/30">
                          {oneDayGap.length > 0 ? oneDayGap.join(' | ') : '-'}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50/30">
                          {violations.length > 0 ? violations.join(', ') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {people.every(person => {
                    const monthStr = format(currentDate, 'yyyy-MM');
                    const personMonthShifts = shifts
                      .filter(s => s.personId === person.id && s.date.startsWith(monthStr))
                      .sort((a, b) => a.date.localeCompare(b.date));

                    let hasIssue = false;
                    personMonthShifts.forEach((s, i) => {
                      if (person.unavailableDates?.includes(s.date)) hasIssue = true;
                      if (i < personMonthShifts.length - 1) {
                        const d1 = parseLocal(s.date);
                        const d2 = parseLocal(personMonthShifts[i + 1].date);
                        const diffTime = Math.abs(d2.getTime() - d1.getTime());
                        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays <= 2) hasIssue = true;
                      }
                    });
                    return !hasIssue;
                  }) && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-sm text-emerald-600 font-medium bg-emerald-50/30">
                          No conflicts or warnings found for this month. Perfect schedule! ✨
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-bold">Version History</h3>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                {versions.filter(v => v.month === format(currentDate, 'yyyy-MM')).sort((a, b) => b.timestamp - a.timestamp).length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No saved versions for this month.</p>
                ) : (
                  versions.filter(v => v.month === format(currentDate, 'yyyy-MM')).sort((a, b) => b.timestamp - a.timestamp).map(version => (
                    <div key={version.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors">
                      <div>
                        <div className="font-medium text-sm">{format(new Date(version.timestamp), 'MMM d, yyyy HH:mm')}</div>
                        <div className="text-xs text-gray-500">{version.shifts.length} shifts saved</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={!isExcelUnlocked}
                          onClick={() => {
                            if (confirm('Are you sure you want to restore this version? Current unsaved changes for this month will be lost.')) {
                              const otherMonthsShifts = shifts.filter(s => !s.date.startsWith(version.month));
                              setShifts([...otherMonthsShifts, ...version.shifts]);
                              setShowHistoryModal(false);
                            }
                          }}
                          className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-colors ${isExcelUnlocked ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                        >
                          Restore
                        </button>
                        <button
                          disabled={!isExcelUnlocked}
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this version?')) {
                              setVersions(versions.filter(v => v.id !== version.id));
                            }
                          }}
                          className={`px-2 py-1.5 rounded-lg transition-colors ${isExcelUnlocked ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-xl max-w-sm w-full"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  {isChangingPassword ? 'Change Password' : 'Unlock Spreadsheet'}
                </h3>
                <button onClick={() => { setShowPasswordModal(false); setIsChangingPassword(false); setPasswordInput(''); setNewPasswordInput(''); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                    {isChangingPassword ? 'Current Password' : 'Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 border border-gray-100 pr-10"
                      placeholder="Enter password..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {isChangingPassword && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 border border-gray-100 pr-10"
                        placeholder="Enter new password..."
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => {
                      const savedPassword = localStorage.getItem('wayne_excel_password') || '123456';
                      if (passwordInput === savedPassword) {
                        if (isChangingPassword) {
                          if (newPasswordInput.trim()) {
                            localStorage.setItem('wayne_excel_password', newPasswordInput);
                            alert('Password changed successfully!');
                            setIsChangingPassword(false);
                            setNewPasswordInput('');
                            setPasswordInput('');
                          } else {
                            alert('New password cannot be empty.');
                          }
                        } else {
                          setIsExcelUnlocked(true);
                          setShowPasswordModal(false);
                          setPasswordInput('');
                        }
                      } else {
                        alert('Incorrect password!');
                      }
                    }}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors"
                  >
                    {isChangingPassword ? 'Save New Password' : 'Unlock'}
                  </button>
                </div>

                {!isChangingPassword && (
                  <div className="text-center mt-4">
                    <button
                      onClick={() => setIsChangingPassword(true)}
                      className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Change Password
                    </button>
                  </div>
                )}
                {isChangingPassword && (
                  <div className="text-center mt-4">
                    <button
                      onClick={() => { setIsChangingPassword(false); setPasswordInput(''); setNewPasswordInput(''); }}
                      className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
