import { appOrigin, authEnv, cloudinaryEnv, databaseEnv, realtimeEnv } from './env';

// Configuration-only preflight: do not connect to services or print their values.
export function productionConfigurationIssues(): string[] {
  const issues: string[] = [];
  if (process.env.NODE_ENV !== 'production') issues.push('NODE_ENV must be production for this preflight.');
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_') && value && /SECRET|PASSWORD|TOKEN|MONGODB|PRIVATE_KEY|API_KEY/.test(key)) issues.push('Remove secret-like NEXT_PUBLIC variables from this environment.');
  }
  try { databaseEnv(); } catch { issues.push('Configure MONGODB_URI.'); }
  let canonical: string | undefined;
  try {
    canonical = appOrigin();
    const url = new URL(canonical);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) issues.push('APP_URL must be the public HTTPS production origin.');
  } catch { issues.push('Configure APP_URL as the canonical production origin.'); }
  try { if (authEnv().origin !== canonical) issues.push('AUTH_URL (or legacy NEXTAUTH_URL) must match APP_URL.'); }
  catch { issues.push('Configure AUTH_SECRET (32+ random characters) and AUTH_URL.'); }
  if (process.env.AUTH_URL && process.env.NEXTAUTH_URL && process.env.AUTH_URL !== process.env.NEXTAUTH_URL) issues.push('Remove conflicting AUTH_URL/NEXTAUTH_URL values.');
  try { if (!realtimeEnv()) issues.push('Configure all four REALTIME variables.'); } catch { issues.push('Configure all four REALTIME variables.'); }
  try { cloudinaryEnv(); } catch { issues.push('Configure all three CLOUDINARY variables.'); }
  return [...new Set(issues)];
}
