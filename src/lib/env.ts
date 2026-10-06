import { z } from 'zod';

const databaseSchema = z.object({
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
});

export function databaseEnv() {
  const result = databaseSchema.safeParse(process.env);
  if (!result.success) throw new Error('Configure a valid MONGODB_URI in .env.local.');
  return result.data;
}

export function appOrigin() {
  const parsed = z.url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  }).safeParse(process.env.APP_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000'));
  if (!parsed.success) throw new Error('Configure APP_URL as the canonical site origin.');
  return new URL(parsed.data).origin;
}

export function authEnv() {
  const parsed = z.object({
    secret: z.string().min(32),
    origin: z.url().refine(value => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
    }),
  }).safeParse({ secret: process.env.AUTH_SECRET, origin: process.env.AUTH_URL || process.env.NEXTAUTH_URL });
  if (!parsed.success) throw new Error('Configure AUTH_SECRET (at least 32 characters) and AUTH_URL (site origin).');
  return { secret: parsed.data.secret, origin: new URL(parsed.data.origin).origin };
}

export function realtimeEnv() {
  const values = { appId: process.env.REALTIME_APP_ID, key: process.env.REALTIME_KEY, secret: process.env.REALTIME_SECRET, cluster: process.env.REALTIME_CLUSTER };
  if (Object.values(values).every(value => !value)) return null;
  const parsed = z.object({ appId: z.string().regex(/^\d+$/), key: z.string().min(1), secret: z.string().min(1), cluster: z.string().regex(/^[a-z0-9-]+$/) }).safeParse(values);
  if (!parsed.success) throw new Error('Configure all four REALTIME variables for Pusher.');
  return parsed.data;
}

export function cloudinaryEnv() {
  const parsed = z.object({ cloudName: z.string().regex(/^[a-zA-Z0-9_-]+$/), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).safeParse({ cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET });
  if (!parsed.success) throw new Error('Configure all three CLOUDINARY variables to upload images.');
  return parsed.data;
}
