import { migrateOrderIndexes } from '../src/lib/order-indexes';
import mongoose from 'mongoose';
import { connectMongo } from '../src/lib/mongodb';
import * as models from '../src/models';

async function main() {
  await connectMongo();
  // Add declared indexes, then replace only the two legacy table-order constraints.
  for (const model of Object.values(models)) await model.createIndexes();
  await migrateOrderIndexes();
  console.log('Database indexes created.');
}
main().catch(() => { console.error('Index creation failed. Check database connectivity and duplicate records.'); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
