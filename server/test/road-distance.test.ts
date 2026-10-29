import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '../model/order';
import type { Rider } from '../model/rider';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5999/unused';

const SHOP = { lat: 16.2465, lng: 103.2505, name: 'ร้านทดสอบ' };
const rider: Rider = { id: 1, name: 'ไรเดอร์ 1', phone: '0800000001', color: '#e6194B', maxOrders: 3, status: 'active' };
const order = (id: number, lat: number, lng: number): Order => ({
  id,
  orderNumber: `T-${id}`,
  customerId: id,
  customerName: `ลูกค้า ${id}`,
  boxCount: 1,
  lat,
  lng,
  zone: 'หน้าป้าย'
});
const A = order(1, 16.2440, 103.2600);
const C = order(2, 16.2425, 103.2615);
const POINTS = [
  { lat: SHOP.lat, lng: SHOP.lng },
  { lat: 16.2440, lng: 103.2600 },
  { lat: 16.2425, lng: 103.2615 }
];

test('optimize without a matrix keeps straight-line behaviour (A first)', async () => {
  const { RouteOptimizerService } = await import('../services/route-optimizer');
  const plan = new RouteOptimizerService().optimize([A, C], [rider], SHOP, 0);
  const stops = plan.routes[0].waypoints.filter(w => w.type === 'delivery').map(w => w.orderId);
  assert.deepEqual(stops, [1, 2]);
  assert.equal(plan.routes[0].totalDistanceKm, 1.28);
});

test('optimize reads road distances from the matrix (C first, km from matrix)', async () => {
  const { RouteOptimizerService } = await import('../services/route-optimizer');
  const matrix = [
    [0, 5, 1],
    [5, 0, 0.5],
    [1, 0.5, 0]
  ];
  const plan = new RouteOptimizerService().optimize([A, C], [rider], SHOP, 0, matrix);
  const route = plan.routes[0];
  const stops = route.waypoints.filter(w => w.type === 'delivery').map(w => w.orderId);
  assert.deepEqual(stops, [2, 1]);
  assert.equal(route.totalDistanceKm, 1.5);
  assert.equal(route.distanceBoxFee, 6);
});

test('optimize ignores a matrix of the wrong size', async () => {
  const { RouteOptimizerService } = await import('../services/route-optimizer');
  const plan = new RouteOptimizerService().optimize([A, C], [rider], SHOP, 0, [[0]]);
  assert.equal(plan.routes[0].totalDistanceKm, 1.28);
});

test('routePoints: index 0 is the shop, then orders in order', async () => {
  const { routePoints } = await import('../services/route-optimizer');
  assert.deepEqual(routePoints([A, C], SHOP), [
    { lat: SHOP.lat, lng: SHOP.lng },
    { lat: A.lat, lng: A.lng },
    { lat: C.lat, lng: C.lng }
  ]);
});

test('ROAD_DISTANCE=off -> straight-line matrix', async () => {
  const { getRoadDistanceMatrix } = await import('../services/road-distance');
  const prev = process.env.ROAD_DISTANCE;
  process.env.ROAD_DISTANCE = 'off';
  try {
    const { matrix, source } = await getRoadDistanceMatrix(POINTS);
    assert.equal(source, 'straight');
    assert.equal(matrix[0][1], 1.05);
    assert.equal(matrix[1][2], 0.23);
    assert.equal(matrix[2][2], 0);
  } finally {
    if (prev === undefined) delete process.env.ROAD_DISTANCE;
    else process.env.ROAD_DISTANCE = prev;
  }
});

async function withMockedOsrm(
  reply: typeof fetch,
  run: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;
  const previous = { road: process.env.ROAD_DISTANCE, url: process.env.OSRM_URL };
  delete process.env.ROAD_DISTANCE;
  process.env.OSRM_URL = 'https://osrm.example.test';
  globalThis.fetch = reply;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.road === undefined) delete process.env.ROAD_DISTANCE;
    else process.env.ROAD_DISTANCE = previous.road;
    if (previous.url === undefined) delete process.env.OSRM_URL;
    else process.env.OSRM_URL = previous.url;
  }
}

test('complete OSRM matrix reports road distance without a real request', async () => {
  const { getRoadDistanceMatrix } = await import('../services/road-distance');
  await withMockedOsrm(async (url) => {
    assert.match(String(url), /^https:\/\/osrm\.example\.test\/table\/v1\/driving\//);
    return new Response(JSON.stringify({
      code: 'Ok',
      distances: [[0, 1000, 2000], [1000, 0, 500], [2000, 500, 0]]
    }), { status: 200 });
  }, async () => {
    const result = await getRoadDistanceMatrix(POINTS);
    assert.equal(result.source, 'road');
    assert.equal(result.matrix[0][1], 1);
    assert.equal(result.matrix[1][2], 0.5);
  });
});

test('partial OSRM matrix uses entirely straight-line distances and reports straight', async () => {
  const { getRoadDistanceMatrix, straightLineMatrix } = await import('../services/road-distance');
  const points = [...POINTS.slice(0, 2), { lat: 16.2426, lng: 103.2615 }];
  await withMockedOsrm(async () => new Response(JSON.stringify({
    code: 'Ok',
    distances: [[0, 50000, null], [50000, 0, 500], [null, 500, 0]]
  }), { status: 200 }), async () => {
    const result = await getRoadDistanceMatrix(points);
    assert.equal(result.source, 'straight');
    assert.deepEqual(result.matrix, straightLineMatrix(points));
  });
});

test('OSRM error falls back without a real request', async () => {
  const { getRoadDistanceMatrix, straightLineMatrix } = await import('../services/road-distance');
  const points = [...POINTS.slice(0, 2), { lat: 16.2427, lng: 103.2615 }];
  await withMockedOsrm(async () => new Response(null, { status: 503 }), async () => {
    const result = await getRoadDistanceMatrix(points);
    assert.equal(result.source, 'straight');
    assert.deepEqual(result.matrix, straightLineMatrix(points));
  });
});

test('OSRM timeout aborts and falls back without a real request', async () => {
  const { getRoadDistanceMatrix, straightLineMatrix } = await import('../services/road-distance');
  const points = [...POINTS.slice(0, 2), { lat: 16.2428, lng: 103.2615 }];
  await withMockedOsrm(async (_url, options) => {
    const signal = options?.signal;
    assert.ok(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  }, async () => {
    const result = await getRoadDistanceMatrix(points);
    assert.equal(result.source, 'straight');
    assert.deepEqual(result.matrix, straightLineMatrix(points));
  });
});
