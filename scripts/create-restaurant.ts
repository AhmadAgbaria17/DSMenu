import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { createRestaurant } from '../src/lib/restaurant-admin';
async function main() {
  const { values } = parseArgs({ options: {
    name: { type: 'string' }, slug: { type: 'string' },
    'default-language': { type: 'string', default: 'ar' },
    languages: { type: 'string', default: 'ar,he,en' }, currency: { type: 'string', default: 'ILS' },
  } });
  const result = await createRestaurant({ name: values.name, slug: values.slug, defaultLanguage: values['default-language'], enabledLanguages: values.languages.split(',').map(value => value.trim()), currency: values.currency });
  console.log(`Created restaurant: ${result.slug}. No users, passwords or demo menu were created.`);
}
main().catch(() => {
  console.error('Restaurant creation failed. Check name, unique lowercase slug, database/index setup and supported defaults (ar; ar,he,en; ILS). Existing restaurants are never overwritten.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
