// Test process only. Production has no mock switches or alternative provider URL.
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.cloudinary.com') {
    if (!process.env.DSMENU_TEST_CLOUDINARY_PORT) throw new Error('Real Cloudinary forbidden in tests');
    url.protocol = 'http:'; url.hostname = '127.0.0.1'; url.port = process.env.DSMENU_TEST_CLOUDINARY_PORT;
    return originalFetch(url, init);
  }
  return originalFetch(input, init);
};
