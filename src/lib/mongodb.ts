import mongoose from 'mongoose';
import { databaseEnv } from './env';

const globalMongo = globalThis as typeof globalThis & {
  dsmenuMongo?: Promise<typeof mongoose>;
};

// Share the connection across requests and development hot reloads.
export async function connectMongo() {
  if (!globalMongo.dsmenuMongo) {
    globalMongo.dsmenuMongo = mongoose.connect(databaseEnv().MONGODB_URI, {
      autoIndex: process.env.NODE_ENV !== 'production',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    }).catch((error: unknown) => {
      globalMongo.dsmenuMongo = undefined;
      throw error;
    });
  }
  return globalMongo.dsmenuMongo;
}
