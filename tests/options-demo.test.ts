import assert from 'node:assert/strict';
import test from 'node:test';
import { demoOptionGroups, validateDemoTarget } from '../scripts/options-demo-data';
import { defaultSelections, resolveOptions } from '../src/lib/product-options';

test('options demo is fully translated, has included defaults, three paid extras and a single sauce', () => {
  assert.deepEqual(demoOptionGroups.map(g => g.type), ['INCLUDED', 'MULTIPLE', 'SINGLE']);
  const selections = defaultSelections(demoOptionGroups); assert.equal(selections[0].optionIds.length, 4); assert.equal(selections[2].optionIds.length, 1);
  assert.deepEqual(demoOptionGroups[1].options.map(o => o.priceDelta), [500, 600, 1500]); assert.equal(demoOptionGroups[1].maxSelections, 3);
  selections[0].optionIds.splice(1, 1); selections[1].optionIds = [demoOptionGroups[1].options[0].id];
  const result = resolveOptions(demoOptionGroups, selections); assert.equal((4800 + result.optionsTotal) * 2, 10600); assert.equal(result.optionGroups[0].removed[0].nameEn, 'Tomato');
  for (const item of demoOptionGroups.flatMap(g => [g, ...g.options])) { assert.notEqual(item.nameAr, item.nameEn); assert.notEqual(item.nameHe, item.nameEn); }
});
test('demo command refuses production, remote databases, missing and ordinary application database URLs', () => {
  const uri = 'mongodb://127.0.0.1:27017/dsmenu_options_demo?replicaSet=rs0';
  assert.equal(validateDemoTarget(uri, 'development'), uri);
  assert.throws(() => validateDemoTarget(uri, 'production'));
  for (const bad of [undefined, 'mongodb://127.0.0.1:27017/test', 'mongodb+srv://example.com/dsmenu_options_demo', 'mongodb://example.com/dsmenu_options_demo']) assert.throws(() => validateDemoTarget(bad, 'development'));
});
