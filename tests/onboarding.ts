import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Restaurant, User } from '../src/models';
export async function runOnboardingChecks() {
  const invoke = (args: string[]) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/create-restaurant.ts', ...args], { env: { ...process.env, NODE_ENV: 'production' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; }); child.on('error', reject); child.on('close', code => resolve({ code, output }));
  });
  const args = ['--name', 'Real Restaurant', '--slug', 'real-restaurant'];
  const created = await invoke(args); assert.equal(created.code, 0, created.output);
  const restaurant = await Restaurant.findOne({ slug: 'real-restaurant' }).orFail(); assert.equal(restaurant.name, 'Real Restaurant'); assert.equal(restaurant.currency, 'ILS'); assert.equal(restaurant.defaultLanguage, 'ar'); assert.deepEqual([...restaurant.enabledLanguages], ['ar', 'he', 'en']);
  assert.equal(await User.countDocuments({ restaurantId: restaurant._id }), 0, 'no implicit default account/password');
  const duplicate = await invoke(['--name', 'Overwrite Attempt', '--slug', 'real-restaurant']); assert.equal(duplicate.code, 1); assert.equal((await Restaurant.findById(restaurant._id).orFail()).name, 'Real Restaurant');
  const invalid = await invoke(['--name', 'Invalid', '--slug', '../bad']); assert.equal(invalid.code, 1); assert.equal(await Restaurant.countDocuments({ name: 'Invalid' }), 0);
  assert.equal((await invoke([...args, '--password', 'should-not-be-accepted'])).code, 1);
  for (const result of [created, duplicate, invalid]) assert.equal(result.output.includes(process.env.MONGODB_URI!), false);
  console.log('PASS: production-mode restaurant CLI validates inputs, requires unique indexes, inserts supported defaults, rejects duplicates without overwriting and creates no passwords.');
}
