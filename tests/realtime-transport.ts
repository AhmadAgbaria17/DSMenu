import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import type { BrowserContext, WebSocketRoute } from '@playwright/test';
import { Order, ServiceCall } from '../src/models';

type Event = { name: string; channels: string[]; data: string };
export const realtimeTest = {
  events: [] as (Event & { committed: { id: string; status: string }[] })[],
  failNext: false,
  sockets: new Map<WebSocketRoute, Set<string>>(),
  broadcast(event: Event) {
    for (const [socket, channels] of this.sockets) for (const channel of event.channels) {
      if (channels.has(channel)) socket.send(JSON.stringify({ event: event.name, channel, data: event.data }));
    }
  },
};
export async function startRealtimeTransport() {
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const event = JSON.parse(Buffer.concat(chunks).toString()) as Event;
      assert.ok(request.url?.startsWith('/apps/123/events?'));
      const visit = event.channels.find(channel => channel.startsWith('private-table-session-'))?.slice('private-table-session-'.length);
      const committed = event.name.startsWith('serviceCall.')
        ? await ServiceCall.find({ tableSessionId: visit }).select('_id status').lean()
        : await Order.find({ tableSessionId: visit }).select('_id status').lean();
      realtimeTest.events.push({ ...event, committed: committed.map(order => ({ id: String(order._id), status: order.status })) });
      if (realtimeTest.failNext) { realtimeTest.failNext = false; response.writeHead(503); response.end('{}'); return; }
      realtimeTest.broadcast(event);
      response.setHeader('Content-Type', 'application/json'); response.end('{}');
    } catch { response.writeHead(500); response.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  process.env.DSMENU_TEST_PUSHER_PORT = String(address.port);
  process.env.REALTIME_APP_ID = '123'; process.env.REALTIME_KEY = 'dsmenu-test-key';
  process.env.REALTIME_SECRET = 'dsmenu-test-secret'; process.env.REALTIME_CLUSTER = 'eu';
  return async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); };
}
let socketNumber = 1;
export async function mockRealtime(context: BrowserContext) {
  await context.routeWebSocket(/wss:\/\/ws-eu\.pusher\.com\//, socket => {
    const id = `${socketNumber++}.100`;
    const channels = new Set<string>();
    realtimeTest.sockets.set(socket, channels);
    socket.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: id, activity_timeout: 120 }) }));
    socket.onMessage(message => {
      const packet = JSON.parse(String(message)) as { event: string; data: { channel?: string; auth?: string } };
      if (packet.event === 'pusher:ping') { socket.send(JSON.stringify({ event: 'pusher:pong', data: '{}' })); return; }
      const channel = packet.data.channel;
      if (packet.event === 'pusher:subscribe' && channel) {
        const signature = createHmac('sha256', process.env.REALTIME_SECRET!).update(`${id}:${channel}`).digest('hex');
        assert.equal(packet.data.auth, `${process.env.REALTIME_KEY}:${signature}`, 'private subscription has a genuine application signature');
        channels.add(channel);
        socket.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel, data: '{}' }));
      }
      if (packet.event === 'pusher:unsubscribe' && channel) channels.delete(channel);
    });
    socket.onClose(() => { realtimeTest.sockets.delete(socket); });
  });
}
