import { createIdFromString, idToUuid } from '@evolu/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A new id: a UUID, which is what the synced database keys its rows by. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // No `randomUUID` outside secure contexts: build a version 4 UUID by hand.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = (8 + Math.floor(Math.random() * 4)).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * An id as the app keeps it: a lowercase UUID. Ids that are not UUIDs (from
 * data made before the app synced) become the UUID their text hashes to, the
 * same one every time, so importing a file twice gives the same rows.
 */
export function normalizeId(id: string): string {
  const lower = id.toLowerCase();
  return UUID_RE.test(lower) ? lower : idToUuid(createIdFromString(id));
}
