export const PERSONAL_DATA_MAX_BYTES: number;
export function isPersonalKey(key: unknown): key is string;
export function validateEntries(entries: unknown): entries is Record<string, string>;
