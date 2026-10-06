import mongoose from 'mongoose';
import { connectMongo } from '../src/lib/mongodb';
import * as models from '../src/models';

async function main() {
  await connectMongo();
  // Add declared indexes without dropping existing production indexes.
  for (const model of Object.values(models)) await model.createIndexes();
  console.log('Database indexes created.');
}
main().catch(() => { console.error('Index creation failed. Check database connectivity and duplicate records.'); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
