import { THAI_HOLIDAYS_DATA } from "./constants";

export const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

export const getFirstDayOfWeek = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

export const isWeekend = (year: number, month: number, day: number) => {
    const dow = new Date(year, month, day).getDay();
    return dow === 0 || dow === 6;
};

export const getWeekendSet = (year: number, month: number) => {
    const days = getDaysInMonth(year, month);
    const s = new Set<number>();
    for (let d = 1; d <= days; d++) {
        if (isWeekend(year, month, d)) s.add(d);
    }
    return s;
};

export const getThaiHolidays = (year: number, month: number) =>
    (THAI_HOLIDAYS_DATA[year]?.[month] || []).map((h) => ({ date: h.d, name: h.n }));

export const getThaiHolidayMap = (year: number, month: number) =>
    new Map(getThaiHolidays(year, month).map((h) => [h.date, h.name]));

export const isThaiHoliday = (year: number, month: number, day: number) =>
    getThaiHolidays(year, month).some((h) => h.date === day);

export const monthKey = (year: number, month: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}`;

export const getToday = () => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};

export const isToday = (year: number, month: number, day: number) => {
    const t = getToday();
    return t.year === year && t.month === month && t.day === day;
};
