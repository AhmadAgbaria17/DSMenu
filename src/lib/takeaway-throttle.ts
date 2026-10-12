import { createHash } from 'node:crypto';
const attempts = new Map<string, { count: number; until: number }>();
// Best effort per instance; configure a trusted-proxy deployment rate limit as well.
export function allowTakeawayEntry(address: string, now = Date.now()) {
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const key = createHash('sha256').update(address.slice(0, 200)).digest('hex');
  let entry = attempts.get(key);
  if (!entry) { if (attempts.size >= 10000) return false; entry = { count: 0, until: now + 60000 }; attempts.set(key, entry); }
  return ++entry.count <= 30;
}
