import { Order } from '../model/order';
import { Rider } from '../model/rider';
import { RoutePoint, RiderRoute, RouteOptimizationResult, OutOfRangeOrder } from '../model/route-plan';
import { SHOP_LOCATION } from '../dbconnect';
import { ZONES, Zone, isZone, inferZone } from '../model/zones';

const MAX_ORDERS_PER_RIDER = 3;

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function routePoints(orders: Order[], shop = SHOP_LOCATION): { lat: number; lng: number }[] {
  return [
    { lat: shop.lat, lng: shop.lng },
    ...orders.map(o => ({ lat: o.lat ?? shop.lat, lng: o.lng ?? shop.lng }))
  ];
}

export const MAX_DELIVERY_RADIUS_KM = 3;

export function distanceFromShopKm(lat: number, lng: number, shop = SHOP_LOCATION): number {
  return calculateDistanceKm(shop.lat, shop.lng, lat, lng);
}

export function isWithinDeliveryArea(lat: number, lng: number, shop = SHOP_LOCATION): boolean {
  return distanceFromShopKm(lat, lng, shop) <= MAX_DELIVERY_RADIUS_KM;
}

export function getEstimatedTimeStr(minutesFromStart: number): string {
  const startHour = 11;
  const startMinute = 30;
  const totalMinutes = startHour * 60 + startMinute + Math.round(minutesFromStart);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export class RouteOptimizerService {
  public optimize(
    orders: Order[],
    riders: Rider[],
    shop = SHOP_LOCATION,
    strategySeed: number = 0,
    distanceMatrix?: number[][]
  ): RouteOptimizationResult {
    if (orders.length === 0) {
      return {
        routes: [],
        summary: {
          totalOrders: 0,
          totalBoxes: 0,
          assignedRidersCount: 0,
          totalDistanceKm: 0,
          totalDeliveryCost: 0,
          totalRevenue: 0,
          totalFoodCost: 0,
          netProfit: 0,
          profitMarginPercent: 0,
          onTimeDeliveryRate: 100,
          allOnTime: true,
          outOfRangeOrders: []
        },
        shopLocation: shop
      };
    }

    const points = routePoints(orders, shop);
    const matrix =
      distanceMatrix &&
      distanceMatrix.length === points.length &&
      distanceMatrix.every(row => row.length === points.length)
        ? distanceMatrix
        : undefined;
    const dist = (a: number, b: number): number =>
      matrix
        ? matrix[a][b]
        : calculateDistanceKm(points[a].lat, points[a].lng, points[b].lat, points[b].lng);

    const orderItems = orders.map((o, i) => {
      const idx = i + 1;
      const lat = o.lat ?? shop.lat;
      const lng = o.lng ?? shop.lng;
      const zone: Zone = isZone(o.zone) ? o.zone : inferZone(lat, lng, o.customerAddress);
      const angle = Math.atan2(lat - shop.lat, lng - shop.lng) + (strategySeed * 0.15);
      const distFromShop = dist(0, idx);
      return { order: o, idx, lat, lng, zone, angle, distFromShop };
    });
    type OrderItem = typeof orderItems[number];

    const outOfRangeOrders: OutOfRangeOrder[] = [];
    const deliverableItems = orderItems.filter(item => {
      const km = distanceFromShopKm(item.lat, item.lng, shop);
      if (km <= MAX_DELIVERY_RADIUS_KM) return true;
      outOfRangeOrders.push({
        orderId: item.order.id,
        orderNumber: item.order.orderNumber,
        customerName: item.order.customerName,
        distanceKm: km
      });
      return false;
    });

    const clusters: { zone: Zone; items: OrderItem[] }[] = [];
    for (const zone of ZONES) {
      const inZone = deliverableItems
        .filter(item => item.zone === zone)
        .sort((a, b) => a.angle - b.angle || a.distFromShop - b.distFromShop);
      for (let i = 0; i < inZone.length; i += MAX_ORDERS_PER_RIDER) {
        clusters.push({ zone, items: inZone.slice(i, i + MAX_ORDERS_PER_RIDER) });
      }
    }

    const activeRiders = riders.filter(r => r.status === 'active');
    const riderRoutes: RiderRoute[] = [];

    for (let i = 0; i < clusters.length; i++) {
      const { zone, items: cluster } = clusters[i];
      const rider = activeRiders[i % activeRiders.length];
      const riderColor = rider.color;

      const unvisited = [...cluster];
      let currentIdx = 0;
      let totalDistKm = 0;
      let totalMinutes = 0;

      const orderedPoints: RoutePoint[] = [
        {
          lat: shop.lat,
          lng: shop.lng,
          customerName: shop.name,
          customerAddress: 'จุดเริ่มต้นรับข้าวกล่อง (11:30 น.)',
          type: 'shop',
          stepNumber: 0,
          distanceFromPrevKm: 0,
          estimatedArrival: '11:30'
        }
      ];

      const orderedOrders: Order[] = [];
      let step = 1;
      let totalBoxes = cluster.reduce((sum, item) => sum + item.order.boxCount, 0);

      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minD = dist(currentIdx, unvisited[0].idx);

        for (let j = 1; j < unvisited.length; j++) {
          const d = dist(currentIdx, unvisited[j].idx);
          if (d < minD) {
            minD = d;
            nearestIdx = j;
          }
        }

        const next = unvisited.splice(nearestIdx, 1)[0];
        totalDistKm += minD;

        const travelMinutes = (minD / 30) * 60;
        totalMinutes += travelMinutes + 3;

        const arrivalTimeStr = getEstimatedTimeStr(totalMinutes);

        orderedPoints.push({
          orderId: next.order.id,
          orderNumber: next.order.orderNumber,
          customerName: next.order.customerName,
          customerPhone: next.order.customerPhone,
          customerAddress: next.order.customerAddress,
          lat: next.lat,
          lng: next.lng,
          boxCount: next.order.boxCount,
          type: 'delivery',
          stepNumber: step,
          distanceFromPrevKm: minD,
          estimatedArrival: arrivalTimeStr
        });

        orderedOrders.push({
          ...next.order,
          assignedRiderId: rider.id,
          deliverySequence: step
        });

        currentIdx = next.idx;
        step++;
      }

      totalDistKm = Number(totalDistKm.toFixed(2));
      const roundedMinutes = Math.round(totalMinutes);
      const finishTimeStr = getEstimatedTimeStr(roundedMinutes);

      const baseDeliveryFee = 15;
      const distanceBoxFee = Number((2 * totalDistKm * totalBoxes).toFixed(2));
      const totalDeliveryCost = baseDeliveryFee + distanceBoxFee;

      const totalRevenue = totalBoxes * 65;
      const totalFoodCost = totalBoxes * 40;
      const netProfit = Number((totalRevenue - totalFoodCost - totalDeliveryCost).toFixed(2));
      const profitMarginPercent = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

      const isLate = roundedMinutes > 60;

      riderRoutes.push({
        riderId: rider.id,
        riderName: rider.name,
        riderPhone: rider.phone,
        color: riderColor,
        zone,
        jobCode: `TASK-${rider.id.toString().padStart(2, '0')}`,
        totalBoxes,
        orderCount: orderedOrders.length,
        orders: orderedOrders,
        waypoints: orderedPoints,
        totalDistanceKm: totalDistKm,
        estimatedDurationMinutes: roundedMinutes,
        estimatedFinishTime: finishTimeStr,
        baseDeliveryFee,
        distanceBoxFee,
        totalDeliveryCost,
        totalRevenue,
        totalFoodCost,
        netProfit,
        profitMarginPercent,
        isLate
      });
    }

    const totalOrders = deliverableItems.length;
    const totalBoxes = deliverableItems.reduce((sum, item) => sum + item.order.boxCount, 0);
    const assignedRidersCount = riderRoutes.length;
    const totalDistanceKm = Number(riderRoutes.reduce((sum, r) => sum + r.totalDistanceKm, 0).toFixed(2));
    const totalDeliveryCost = Number(riderRoutes.reduce((sum, r) => sum + r.totalDeliveryCost, 0).toFixed(2));
    const totalRevenue = Number(riderRoutes.reduce((sum, r) => sum + r.totalRevenue, 0).toFixed(2));
    const totalFoodCost = Number(riderRoutes.reduce((sum, r) => sum + r.totalFoodCost, 0).toFixed(2));
    const netProfit = Number((totalRevenue - totalFoodCost - totalDeliveryCost).toFixed(2));
    const profitMarginPercent = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;
    const onTimeRoutes = riderRoutes.filter(r => !r.isLate).length;
    const onTimeDeliveryRate = riderRoutes.length > 0 ? Math.round((onTimeRoutes / riderRoutes.length) * 100) : 100;

    return {
      routes: riderRoutes,
      summary: {
        totalOrders,
        totalBoxes,
        assignedRidersCount,
        totalDistanceKm,
        totalDeliveryCost,
        totalRevenue,
        totalFoodCost,
        netProfit,
        profitMarginPercent,
        onTimeDeliveryRate,
        allOnTime: onTimeRoutes === riderRoutes.length,
        outOfRangeOrders
      },
      shopLocation: shop
    };
  }
}
