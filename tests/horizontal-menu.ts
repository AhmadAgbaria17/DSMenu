import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';

export async function checkHorizontalMenu(page: Page, direction: 'rtl' | 'ltr') {
  const rows = page.locator('.menu-product-row');
  assert.ok(await rows.count() > 1, 'featured and category rows render');
  const catalog = await page.locator('section[id^="category-"]').evaluateAll(sections => sections.map(section => ({
    id: section.id, products: [...section.querySelectorAll('[data-product-id]')].map(card => card.getAttribute('data-product-id')),
  })));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${direction}: no page overflow at ${width}`);
    for (const categoryRow of await rows.all()) {
      const cards = await categoryRow.evaluate(element => ({ direction: getComputedStyle(element).direction, overflow: getComputedStyle(element).overflowX, bounds: [...element.children].map(child => ({ left: child.getBoundingClientRect().left, top: child.getBoundingClientRect().top })) }));
      assert.equal(cards.direction, direction); assert.equal(cards.overflow, 'auto');
      for (let index = 1; index < cards.bounds.length; index++) {
        assert.equal(cards.bounds[index].top, cards.bounds[0].top, 'every category uses a single horizontal row');
        assert.ok(direction === 'rtl' ? cards.bounds[index].left < cards.bounds[index - 1].left : cards.bounds[index].left > cards.bounds[index - 1].left, 'every category preserves logical product order');
      }
    }
    const row = rows.first();
    await row.evaluate(element => { element.scrollLeft = 0; });
    const layout = await row.evaluate(element => {
      const cards = [...element.children].map(child => child.getBoundingClientRect());
      const bounds = element.getBoundingClientRect();
      return { direction: getComputedStyle(element).direction, overflow: getComputedStyle(element).overflowX,
        width: element.clientWidth, scrollWidth: element.scrollWidth, start: bounds.left, end: bounds.right,
        cards: cards.map(card => ({ left: card.left, right: card.right, top: card.top, width: card.width })) };
    });
    assert.equal(layout.direction, direction);
    assert.equal(layout.overflow, 'auto');
    assert.ok(layout.cards.length >= 2, 'seed provides multiple featured cards');
    assert.equal(layout.cards[0].top, layout.cards[1].top, 'products occupy one horizontal row');
    assert.ok(direction === 'rtl' ? layout.cards[0].right > layout.cards[1].right : layout.cards[0].left < layout.cards[1].left, 'first product starts at the language-appropriate side');
    if (width <= 390) {
      assert.ok(layout.scrollWidth > layout.width, 'mobile row scrolls');
      const next = layout.cards[1];
      assert.ok(direction === 'rtl' ? next.right > layout.start && next.left < layout.start : next.left < layout.end && next.right > layout.end, 'next card peeks into view');
      await row.evaluate((element, dir) => { element.scrollLeft = dir === 'rtl' ? -180 : 180; }, direction);
      await expect.poll(() => row.evaluate(element => Math.abs(element.scrollLeft))).toBeGreaterThan(0);
      const lastButton = row.locator('button').last();
      // Move focus away first: focusing an already-focused button after resizing
      // does not ask the browser to reveal it again.
      await row.focus();
      await lastButton.focus();
      await expect(lastButton).toBeFocused();
      await expect.poll(() => lastButton.evaluate(button => {
        const card = button.getBoundingClientRect(); const row = button.closest('.menu-product-row')!.getBoundingClientRect();
        return card.left >= row.left && card.right <= row.right;
      }), { message: 'keyboard focus reveals offscreen controls' }).toBe(true);
    }
    await row.evaluate(element => { element.scrollLeft = 0; });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await rows.evaluateAll(elements => elements.forEach(element => { element.scrollLeft = 0; }));
  return catalog;
}
