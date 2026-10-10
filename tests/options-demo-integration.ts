import assert from 'node:assert/strict';
import { Product } from '../src/models';
import { seedOptionsDemo, optionsDemoProductId } from '../scripts/options-demo-data';

export async function runOptionsDemoChecks() {
  const classic = await Product.findById('d50000000000000200000000').orFail();
  const before = { price: classic.price, nameEn: classic.nameEn, optionGroups: JSON.stringify(classic.optionGroups) };
  const demo = await seedOptionsDemo(); assert.equal(demo.optionGroups.length, 3); assert.equal(demo.price, 4800);
  await Product.updateOne({ _id: demo._id }, { $set: { nameEn: 'Owner-edited demo', price: 5900, 'optionGroups.1.options.0.priceDelta': 700 } });
  await seedOptionsDemo(); const edited = await Product.findById(optionsDemoProductId).orFail();
  assert.equal(edited.nameEn, 'Owner-edited demo'); assert.equal(edited.price, 5900); assert.equal(edited.optionGroups[1].options[0].priceDelta, 700); assert.equal(await Product.countDocuments({ _id: optionsDemoProductId }), 1);
  const after = await Product.findById(classic._id).orFail(); assert.deepEqual({ price: after.price, nameEn: after.nameEn, optionGroups: JSON.stringify(after.optionGroups) }, before);
  console.log('PASS: isolated options demo inserts once and preserves existing Classic Burger and owner edits on rerun.');
}
