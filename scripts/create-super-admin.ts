import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { createSuperAdmin } from '../src/lib/platform-bootstrap';
async function main() {
  const { values } = parseArgs({ options: { name: { type: 'string' }, email: { type: 'string' } } });
  const password = process.env.DSMENU_SUPER_ADMIN_PASSWORD;
  delete process.env.DSMENU_SUPER_ADMIN_PASSWORD;
  await createSuperAdmin({ ...values, password });
  console.log('Super Admin created. Existing accounts were not changed.');
}
main().catch(() => {
  console.error('Creation failed. Check unique email, name, database indexes and DSMENU_SUPER_ADMIN_PASSWORD (12+ characters, maximum 72 UTF-8 bytes).');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
