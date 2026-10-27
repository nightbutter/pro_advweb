import { Order } from '../model/order';
import { Rider } from '../model/rider';
import { RoutePoint, RiderRoute, RouteOptimizationResult } from '../model/route-plan';
import { SHOP_LOCATION } from '../dbconnect';
import { ZONES, Zone, isZone, inferZone } from '../model/zones';

const MAX_ORDERS_PER_RIDER = 3;

// Haversine distance in Kilometers
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
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

// Format minutes from 11:30 to HH:mm string
export function getEstimatedTimeStr(minutesFromStart: number): string {
  const startHour = 11;
  const startMinute = 30;
  const totalMinutes = startHour * 60 + startMinute + Math.round(minutesFromStart);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export class RouteOptimizerService {
  /**
   * Optimize routes for orders:
   * 1. Group orders by delivery zone (ขามเรียง / ท่าขอนยาง / หน้าป้าย)
   * 2. Inside each zone, sort by angle & distance from shop and split into
   *    clusters of at most 3 orders (rider limit)
   * 3. Assign to 13 available fixed riders
   * 4. Optimize each rider route with TSP (Nearest Neighbor from shop)
   * 5. Calculate cost, time, profit based on business rules:
   *    - Rider speed: 30 km/h (0.5 km/min)
   *    - Delivery handover time per stop: 3 minutes
   *    - Base fee: 15 THB
   *    - Distance fee: 2 THB * km * boxes
   *    - Selling price: 65 THB / box
   *    - Food cost: 40 THB / box
   */
  public optimize(
    orders: Order[],
    riders: Rider[],
    shop = SHOP_LOCATION,
    strategySeed: number = 0
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
          allOnTime: true
        },
        shopLocation: shop
      };
    }

    // 1. Prepare order points with zone and angle from shop
    const orderItems = orders.map(o => {
      const lat = o.lat ?? shop.lat;
      const lng = o.lng ?? shop.lng;
      const zone: Zone = isZone(o.zone) ? o.zone : inferZone(lat, lng, o.customerAddress);
      // Angle is only used to order stops inside a zone; seed rotates the start point
      const angle = Math.atan2(lat - shop.lat, lng - shop.lng) + (strategySeed * 0.15);
      const distFromShop = calculateDistanceKm(shop.lat, shop.lng, lat, lng);
      return { order: o, lat, lng, zone, angle, distFromShop };
    });
    type OrderItem = typeof orderItems[number];

    // 2. Group by zone, then split each zone into clusters of max 3 orders.
    //    A rider never crosses into another zone.
    const clusters: { zone: Zone; items: OrderItem[] }[] = [];
    for (const zone of ZONES) {
      const inZone = orderItems
        .filter(item => item.zone === zone)
        .sort((a, b) => a.angle - b.angle || a.distFromShop - b.distFromShop);
      for (let i = 0; i < inZone.length; i += MAX_ORDERS_PER_RIDER) {
        clusters.push({ zone, items: inZone.slice(i, i + MAX_ORDERS_PER_RIDER) });
      }
    }

    // Available active riders (up to 13)
    const activeRiders = riders.filter(r => r.status === 'active');
    const riderRoutes: RiderRoute[] = [];

    // Assign clusters to riders
    for (let i = 0; i < clusters.length; i++) {
      const { zone, items: cluster } = clusters[i];
      const rider = activeRiders[i % activeRiders.length];
      const riderColor = rider.color;

      // TSP: Find shortest tour starting at shop
      // Shop -> Order A -> Order B -> Order C
      const unvisited = [...cluster];
      let currentLat = shop.lat;
      let currentLng = shop.lng;
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
        // Find nearest neighbor
        let nearestIdx = 0;
        let minD = calculateDistanceKm(currentLat, currentLng, unvisited[0].lat, unvisited[0].lng);

        for (let j = 1; j < unvisited.length; j++) {
          const d = calculateDistanceKm(currentLat, currentLng, unvisited[j].lat, unvisited[j].lng);
          if (d < minD) {
            minD = d;
            nearestIdx = j;
          }
        }

        const next = unvisited.splice(nearestIdx, 1)[0];
        totalDistKm += minD;

        // Rider moves at 30 km/h = 2 minutes per km + 3 minutes delivery handover
        const travelMinutes = (minD / 30) * 60;
        totalMinutes += travelMinutes + 3; // + 3 mins for delivery handover

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

        currentLat = next.lat;
        currentLng = next.lng;
        step++;
      }

      totalDistKm = Number(totalDistKm.toFixed(2));
      const roundedMinutes = Math.round(totalMinutes);
      const finishTimeStr = getEstimatedTimeStr(roundedMinutes);

      // Financial calculations according to user specs:
      // - 15 Baht base fee per ride
      // - 2 Baht per km per box for whole route distance
      //   (Total distance * total boxes * 2 Baht)
      const baseDeliveryFee = 15;
      const distanceBoxFee = Number((2 * totalDistKm * totalBoxes).toFixed(2));
      const totalDeliveryCost = baseDeliveryFee + distanceBoxFee;

      const totalRevenue = totalBoxes * 65; // 65 Baht per box
      const totalFoodCost = totalBoxes * 40; // 40 Baht food cost
      const netProfit = Number((totalRevenue - totalFoodCost - totalDeliveryCost).toFixed(2));
      const profitMarginPercent = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

      // Delivery window constraint: 11:30 - 12:30 (Max 60 minutes)
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

    // Overall system summary
    const totalOrders = orders.length;
    const totalBoxes = orders.reduce((sum, o) => sum + o.boxCount, 0);
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
        allOnTime: onTimeRoutes === riderRoutes.length
      },
      shopLocation: shop
    };
  }
}
