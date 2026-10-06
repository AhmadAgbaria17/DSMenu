import { createHash } from 'node:crypto';

const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
// Best-effort, bounded per-process protection. Deployment-level rate limits must
// cover distributed instances/IPs; this is not a distributed security boundary.
export function allowStaffLogin(email: string, now = Date.now()) {
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = createHash('sha256').update(email).digest('hex');
  let entry = attempts.get(key);
  if (!entry) {
    if (attempts.size >= 10_000) return false;
    entry = { count: 0, until: now + WINDOW_MS };
    attempts.set(key, entry);
  }
  entry.count++;
  return entry.count <= 10;
}
