import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { Category, Product, Restaurant } from '../src/models';
export const cloudTest = { uploads: [] as string[], destroyed: [] as string[], failUpload: false, failCleanup: false, beforeUploadResponse: null as (() => Promise<void>) | null, errors: [] as string[] };
export async function startCloudinaryTransport() {
  process.env.CLOUDINARY_CLOUD_NAME = 'dsmenu-test'; process.env.CLOUDINARY_API_KEY = 'test-key'; process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': request.headers['content-type']! }, body: Buffer.concat(chunks) }).formData();
      assert.equal(form.get('api_key'), 'test-key');
      const signed = [...form].filter(([key]) => !['file', 'api_key', 'signature'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
      assert.equal(form.get('signature'), createHash('sha256').update(signed + 'test-secret').digest('hex'));
      const publicId = String(form.get('public_id'));
      assert.match(publicId, /^dsmenu\/[a-f\d]{24}\/(products|categories|restaurant)\/[a-f\d-]{36}$/);
      if (request.url?.endsWith('/upload')) {
        assert.equal(form.get('overwrite'), 'false'); assert.ok(form.get('file') instanceof File);
        if (cloudTest.failUpload) { cloudTest.failUpload = false; response.writeHead(503); response.end('{}'); return; }
        cloudTest.uploads.push(publicId);
        const callback = cloudTest.beforeUploadResponse; cloudTest.beforeUploadResponse = null; await callback?.();
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ public_id: publicId, format: 'webp', version: 1234 }));
      } else {
        assert.ok(request.url?.endsWith('/destroy'));
        assert.equal(await Product.exists({ 'image.publicId': publicId }), null);
        assert.equal(await Category.exists({ 'image.publicId': publicId }), null);
        assert.equal(await Restaurant.exists({ $or: [{ 'logo.publicId': publicId }, { 'coverImage.publicId': publicId }] }), null);
        if (cloudTest.failCleanup) { cloudTest.failCleanup = false; response.writeHead(503); response.end('{}'); return; }
        cloudTest.destroyed.push(publicId); response.end(JSON.stringify({ result: 'ok' }));
      }
    } catch (error) { cloudTest.errors.push(String(error)); response.writeHead(500); response.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string'); process.env.DSMENU_TEST_CLOUDINARY_PORT = String(address.port);
  return async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); };
}
