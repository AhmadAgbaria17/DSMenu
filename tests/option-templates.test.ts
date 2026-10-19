import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyOptionGroup, templatePayload, templateAlreadyAdded } from '../src/lib/option-templates';
import { optionFixture } from './option-fixture';
import { optionGroupsSchema, defaultSelections, resolveOptions } from '../src/lib/product-options';
test('template validation preserves all configuration and rejects invalid prices, limits and ownership', () => {
  for (const group of optionFixture()) assert.deepEqual(templatePayload.parse({ templateName: ' Saved ', isActive: true, group }), { templateName: 'Saved', isActive: true, group });
  const group = optionFixture()[0];
  for (const payload of [
    { templateName: '', isActive: true, group },
    { templateName: 'Saved', isActive: true, group, restaurantId: 'forged' },
    { templateName: 'Saved', isActive: true, group: { ...group, minSelections: 5 } },
    { templateName: 'Saved', isActive: true, group: { ...group, options: group.options.map(o => ({ ...o, priceDelta: 1.5 })) } },
  ]) assert.equal(templatePayload.safeParse(payload).success, false);
});
test('copies have independent IDs, defaults, paid pricing and no shared mutable objects', () => {
  const groups = optionFixture();
  const copies = groups.map(g => copyOptionGroup(g, randomUUID));
  assert.equal(optionGroupsSchema.safeParse(copies).success, true);
  const ids = [...groups, ...copies].flatMap(g => [g.id, ...g.options.map(o => o.id)]);
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 0; i < groups.length; i++) {
    assert.deepEqual({ ...copies[i], id: groups[i].id, options: copies[i].options.map((o, n) => ({ ...o, id: groups[i].options[n].id })) }, groups[i]);
  }
  copies[1].options[0].priceDelta = 600;
  assert.equal(groups[1].options[0].priceDelta, 500);
  const selected = defaultSelections(copies); selected[1].optionIds = [copies[1].options[0].id];
  assert.equal(resolveOptions(copies, selected).optionsTotal, 600);
  assert.throws(() => resolveOptions(copies, defaultSelections(groups)));
});
test('duplicate-template provenance persists independently of authoritative option IDs', () => {
  const group = { ...optionFixture()[0], sourceTemplateId: '123456789012345678901234' };
  assert.equal(templateAlreadyAdded(optionGroupsSchema.parse([group]), group.sourceTemplateId), true);
  assert.equal(templateAlreadyAdded([], group.sourceTemplateId), false);
  assert.equal(templateAlreadyAdded(optionFixture(), group.sourceTemplateId), false);
});
