import mongoose from 'mongoose';
import { connectMongo } from '../src/lib/mongodb';
import { appOrigin } from '../src/lib/env';
import { tableQrUrl } from '../src/lib/qr';
import { seedSalt } from './demo-data';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  await connectMongo();
  await seedSalt();
  console.log(`Salt demo is ready: ${tableQrUrl(appOrigin(), 'salt', 7)}`);
}
main().catch(() => {
  console.error('Seed failed. Check MONGODB_URI, database connectivity and write permissions.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
