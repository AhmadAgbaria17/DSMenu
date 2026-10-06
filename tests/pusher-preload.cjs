// Test process only: route the real SDK's HTTPS publishing requests to a local fake
// provider. Application configuration and production code contain no test bypass.
/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('node:https');
const http = require('node:http');
const original = https.request;
https.request = function (options, callback) {
  if (options.hostname === 'api-eu.pusher.com' && process.env.DSMENU_TEST_PUSHER_PORT) {
    return http.request({ ...options, protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1', port: Number(process.env.DSMENU_TEST_PUSHER_PORT), agent: undefined }, callback);
  }
  return original.apply(this, arguments);
};
