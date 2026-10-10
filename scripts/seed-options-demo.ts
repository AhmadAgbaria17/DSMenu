import mongoose from 'mongoose';
import { connectMongo } from '../src/lib/mongodb';
import { seedOptionsDemo, validateDemoTarget } from './options-demo-data';

async function main() {
  process.env.MONGODB_URI = validateDemoTarget(process.env.DSMENU_DEMO_MONGODB_URI, process.env.NODE_ENV);
  await connectMongo();
  await seedOptionsDemo();
  console.log('Local options demo ready: Classic Burger (Options Demo). Existing products were not overwritten.');
}
main().catch(() => {
  console.error('Demo setup failed. Set DSMENU_DEMO_MONGODB_URI to a local MongoDB replica set database named dsmenu_options_demo. Production mode and remote databases are refused.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
