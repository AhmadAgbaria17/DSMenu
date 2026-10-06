import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { createStaffUser } from '../src/lib/staff-users';

async function main() {
  const { values } = parseArgs({ options: {
    restaurant: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', default: 'STAFF' },
  } });
  const password = process.env.DSMENU_STAFF_PASSWORD;
  delete process.env.DSMENU_STAFF_PASSWORD;
  if (!password) throw new Error('Password required.');
  const user = await createStaffUser({ ...values, password });
  console.log(`Created ${user.role} account: ${user.email}.`);
}
main().catch(() => {
  console.error('User creation failed. Check the active restaurant slug, unique email, name, role, database/index setup and DSMENU_STAFF_PASSWORD (12+ characters, at most 72 UTF-8 bytes). Existing accounts are never overwritten.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
