/**
 * Firebase Realtime DB helpers for cumulative shift tracking.
 * Optimized for free tier: single read per session, single write per finalize.
 *
 * Schema: /cumulative/{personId} → PersonCumulative
 * All sury pool data lives under one path → 1 read fetches everything.
 */
import { database } from './firebase';
import { ref, get, set } from 'firebase/database';
import type { PersonCumulative } from './store/useCumulativeStore';

// Tags that qualify for cumulative tracking (สระบุรี rotation pool)
export const SURY_TAGS = ['r1sry', 'r2sry', 'r3sry'];

export function isSuryPerson(tagIds: string[]): boolean {
    return tagIds.some(t => SURY_TAGS.includes(t));
}

export function getSuryLabel(tagIds: string[]): string {
    if (tagIds.includes('r1sry')) return 'R1 สระบุรี';
    if (tagIds.includes('r2sry')) return 'R2 สระบุรี';
    if (tagIds.includes('r3sry')) return 'R3 สระบุรี';
    return '';
}

/**
 * Load all cumulative data in one Firebase read.
 * Returns null if Firebase is not configured.
 */
export async function loadCumulative(): Promise<Record<string, PersonCumulative> | null> {
    if (!database) return null;
    try {
        const snapshot = await get(ref(database, 'cumulative'));
        return snapshot.exists() ? (snapshot.val() as Record<string, PersonCumulative>) : {};
    } catch (err) {
        console.error('[Firebase] cumulative read failed:', err);
        return null;
    }
}

/**
 * Write the entire cumulative object in one Firebase set.
 * Called only on "Finalize Month" — roughly once per month.
 */
export async function saveCumulative(data: Record<string, PersonCumulative>): Promise<boolean> {
    if (!database) return false;
    try {
        await set(ref(database, 'cumulative'), data);
        return true;
    } catch (err) {
        console.error('[Firebase] cumulative write failed:', err);
        return false;
    }
}
