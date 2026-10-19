import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startRealtimeTransport } from './realtime-transport';
import { startCloudinaryTransport } from './cloudinary-transport';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectMongo } from '../src/lib/mongodb';
import * as models from '../src/models';
import { seedSalt } from '../scripts/demo-data';

async function main() {
  // Keep real transactions/journaling, but bound disposable test resource usage.
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger', args: ['--wiredTigerCacheSizeGB', '0.25', '--wiredTigerEngineConfigString', 'log=(file_max=10MB,prealloc=false)'] } });
  process.env.MONGODB_URI = mongo.getUri('dsmenu_test');
  process.env.AUTH_SECRET = randomBytes(32).toString('base64url');
  process.env.AUTH_URL = 'http://localhost:3107';
  process.env.NEXTAUTH_URL = process.env.AUTH_URL;
  process.env.APP_URL = process.env.AUTH_URL;
  let server: ReturnType<typeof spawn> | undefined;
  let logs = '';
  let stopRealtime: (() => Promise<void>) | undefined;
  let stopCloudinary: (() => Promise<void>) | undefined;
  try {
    await connectMongo();
    for (const model of Object.values(models)) await model.createIndexes();
    const { runOnboardingChecks } = await import('./onboarding');
    await runOnboardingChecks();
    const salt = await seedSalt();
    await seedSalt();
    assert.equal(await models.Table.countDocuments({ restaurantId: salt._id }), 15);
    assert.equal(await models.Product.countDocuments({ restaurantId: salt._id }), 8);
    const table = await models.Table.findOne({ restaurantId: salt._id, tableNumber: 7 }).orFail();
    await assert.rejects(models.Table.create({ restaurantId: salt._id, tableNumber: 7 }), { code: 11000 });
    const session = await models.TableSession.create({ restaurantId: salt._id, tableId: table._id });
    await assert.rejects(models.TableSession.create({ restaurantId: salt._id, tableId: table._id }), { code: 11000 });
    await models.TableSession.updateOne({ _id: session._id }, { $set: { status: 'CLOSED', closedAt: new Date() } });
    const nextSession = await models.TableSession.create({ restaurantId: salt._id, tableId: table._id });
    const call = await models.ServiceCall.create({ restaurantId: salt._id, tableId: table._id, tableSessionId: nextSession._id, type: 'WAITER' });
    await assert.rejects(models.ServiceCall.create({ restaurantId: salt._id, tableId: table._id, tableSessionId: nextSession._id, type: 'WAITER' }), { code: 11000 });
    await models.ServiceCall.updateOne({ _id: call._id }, { $set: { status: 'RESOLVED' } });
    await models.ServiceCall.create({ restaurantId: salt._id, tableId: table._id, tableSessionId: nextSession._id, type: 'WAITER' });

    const other = await models.Restaurant.create({ name: 'Private restaurant', slug: 'other' });
    await models.Table.create({ restaurantId: other._id, tableNumber: 99 });
    const category = await models.Category.create({ restaurantId: other._id, nameAr: 'سري', nameHe: 'פרטי', nameEn: 'TenantSecretCategory' });
    await models.Product.create({ restaurantId: other._id, categoryId: category._id, nameAr: 'سري', nameHe: 'פרטי', nameEn: 'TenantSecretProduct', price: 1000 });
    // Even a malformed cross-tenant category reference must never leak a product.
    await models.Product.create({ restaurantId: salt._id, categoryId: category._id, nameAr: 'خطأ', nameHe: 'שגיאה', nameEn: 'CrossTenantReference', price: 1000 });

    stopRealtime = await startRealtimeTransport();
    stopCloudinary = await startCloudinaryTransport();
    server = spawn(process.execPath, ['--require', resolve('tests/pusher-preload.cjs'), '--require', resolve('tests/cloudinary-preload.cjs'), 'node_modules/next/dist/bin/next', 'start', '-p', '3107'], {
      env: { ...process.env, NODE_ENV: 'production' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout?.on('data', data => { logs += String(data); });
    server.stderr?.on('data', data => { logs += String(data); });
    const base = 'http://localhost:3107';
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error('Next.js exited before readiness.');
      try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Next.js becomes ready');
    const manifest: { node: Record<string, { exportedName?: string }> } = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8'));
    const languageAction = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === 'setLanguage')?.[0];
    assert.ok(languageAction, 'Language action is present in the production build');
    const languageResponse = await fetch(`${base}/r/salt?table=7`, {
      method: 'POST',
      headers: { 'Next-Action': languageAction, 'Content-Type': 'text/plain;charset=UTF-8', Origin: base },
      body: JSON.stringify(['en']),
    });
    assert.equal(languageResponse.status, 200);
    const languageCookie = languageResponse.headers.get('set-cookie') ?? '';
    assert.match(languageCookie, /dsmenu-language=en/);
    assert.match(languageCookie, /httponly/i);
    assert.match(languageCookie, /samesite=lax/i);
    assert.match(languageCookie, /secure/i);
    await languageResponse.text();
    async function page(path: string, locale?: string) {
      const response = await fetch(`${base}${path}`, { headers: locale ? { cookie: `dsmenu-language=${locale}` } : {} });
      return { status: response.status, html: await response.text() };
    }
    const arabic = await page('/r/salt?table=7');
    const home = await page('/', 'en'); assert.match(home.html, /Staff login/); assert.doesNotMatch(home.html, /href="\/r\/salt\?table=7"/);
    assert.equal(arabic.status, 200);
    assert.match(arabic.html, /lang="ar" dir="rtl"/);
    assert.match(arabic.html, /data-testid="detected-table"/);
    assert.match(arabic.html, /الطاولة 7/);
    assert.doesNotMatch(arabic.html, /id="choose-table"/);
    const english = await page('/r/salt?table=7', 'en');
    assert.match(english.html, /lang="en" dir="ltr"/);
    assert.match(english.html, /Table 7/); assert.match(english.html, /Classic Burger/);
    assert.doesNotMatch(english.html, /TenantSecret|CrossTenantReference|passwordHash/);
    assert.match(english.html, /A few house favorites/);
    assert.match(english.html, /Find your next favorite/);
    assert.match(english.html, /data-testid="my-order-button"/);
    assert.doesNotMatch(english.html, /publicId/);
    assert.match((await page('/r/salt?table=7', 'he')).html, /lang="he" dir="rtl"/);
    assert.match((await page('/r/salt?table=7', 'invalid')).html, /lang="ar" dir="rtl"/);
    assert.match((await page('/r/salt', 'en')).html, /id="choose-table"/);
    for (const query of ['99', '0', '7abc', '7&table=8']) {
      const invalid = await page(`/r/salt?table=${query}`, 'en');
      assert.match(invalid.html, /This table link is invalid/);
      assert.doesNotMatch(invalid.html, /data-testid="detected-table"|id="choose-table"/);
    }
    if (process.argv.includes('--browser')) {
      const { runBrowserChecks } = await import('./browser-flows');
      const burger = await models.Product.findOne({ restaurantId: salt._id, nameEn: 'Classic Burger' }).orFail();
      const unavailable = await models.Product.findOne({ restaurantId: salt._id, isAvailable: false }).orFail();
      const counts = await Promise.all([models.Order.countDocuments(), models.TableSession.countDocuments(), models.ServiceCall.countDocuments()]);
      await runBrowserChecks(base, String(salt._id), String(burger._id), String(unavailable._id), async patch => {
        await models.Product.updateOne({ restaurantId: salt._id, _id: burger._id }, { $set: patch }, { runValidators: true });
      });
      // Phase 3 intentionally establishes visits on entry. Browsing still must not
      // create orders or service calls; table 7 is reused and only tables 8/99 are new.
      assert.deepEqual(await Promise.all([models.Order.countDocuments(), models.ServiceCall.countDocuments()]), [counts[0], counts[2]], 'browsing never submits orders or service calls');
      assert.equal(await models.TableSession.countDocuments(), counts[1] + 2, 'only newly visited tables create sessions');
      const { runOrderBrowserChecks } = await import('./order-browser');
      await runOrderBrowserChecks(base);
    }
    const { runOrderHttpChecks } = await import('./order-http');
    await runOrderHttpChecks(base);
    const { runStaffHttpChecks } = await import('./staff-http');
    const staffFixture = await runStaffHttpChecks(base);
    if (process.argv.includes('--browser')) {
      const { runStaffBrowserChecks } = await import('./staff-browser');
      await runStaffBrowserChecks(base, staffFixture);
    }
    const { runLiveHttpChecks } = await import('./live-http');
    await runLiveHttpChecks(base, staffFixture);
    const { runServiceHttpChecks } = await import('./service-http');
    await runServiceHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) {
      const { runLiveBrowserChecks } = await import('./live-browser');
      await runLiveBrowserChecks(base, staffFixture);
      const { runServiceBrowserChecks } = await import('./service-browser');
      await runServiceBrowserChecks(base, staffFixture);
    }
    const { runMenuHttpChecks } = await import('./menu-http');
    await runMenuHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runMenuBrowserChecks } = await import('./menu-browser'); await runMenuBrowserChecks(base, staffFixture); }
    const { runTableHttpChecks } = await import('./table-http');
    await runTableHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runTableBrowserChecks } = await import('./table-browser'); await runTableBrowserChecks(base, staffFixture); }
    const { runAnalyticsHttpChecks } = await import('./analytics-http');
    const analyticsFixture = await runAnalyticsHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runAnalyticsBrowserChecks } = await import('./analytics-browser'); await runAnalyticsBrowserChecks(base, analyticsFixture); }
    const { runOptionsHttpChecks } = await import('./options-http');
    await runOptionsHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runOptionsBrowserChecks } = await import('./options-browser'); await runOptionsBrowserChecks(base, staffFixture); }
    const { runOptionsDemoChecks } = await import('./options-demo-integration');
    await runOptionsDemoChecks();
    const { runPlatformHttpChecks } = await import('./platform-http');
    const platformFixture = await runPlatformHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runPlatformBrowserChecks } = await import('./platform-browser'); await runPlatformBrowserChecks(base, platformFixture); }
    const { runTakeawayHttpChecks } = await import('./takeaway-http');
    await runTakeawayHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser') || process.argv.includes('--takeaway-browser')) { const { runTakeawayBrowserChecks } = await import('./takeaway-browser'); await runTakeawayBrowserChecks(base, staffFixture); }
    const { runTemplateHttpChecks } = await import('./option-templates-http');
    await runTemplateHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runTemplateBrowserChecks } = await import('./option-templates-browser'); await runTemplateBrowserChecks(base, staffFixture); }
    const { runBillHttpChecks } = await import('./table-bill-http');
    await runBillHttpChecks(base, staffFixture);
    if (process.argv.includes('--browser')) { const { runBillBrowserChecks } = await import('./table-bill-browser'); await runBillBrowserChecks(base, staffFixture); }
    await models.Table.updateOne({ _id: table._id }, { $set: { isActive: false } });
    assert.match((await page('/r/salt?table=7', 'en')).html, /This table link is invalid/);
    await models.Table.updateOne({ _id: table._id }, { $set: { isActive: true } });
    await models.Restaurant.updateOne({ _id: salt._id }, { $set: { hideUnavailableProducts: true } });
    assert.doesNotMatch((await page('/r/salt', 'en')).html, /Cheesecake/);
    await models.Restaurant.updateOne({ _id: salt._id }, { $set: { isActive: false } });
    assert.match((await page('/r/salt', 'en')).html, /Restaurant not found/);
    assert.match((await page('/r/missing', 'en')).html, /Restaurant not found/);
    console.log('PASS: seed reruns, unique indexes, active sessions, service deduplication, tenant isolation, table detection, invalid/inactive tables, visibility settings, language cookie action and ar/he/en SSR.');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
    await stopRealtime?.();
    await stopCloudinary?.();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
