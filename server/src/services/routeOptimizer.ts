import { Order, RoutePoint, RiderRoute, RouteOptimizationResult, Rider } from '../models/types';
import { SHOP_LOCATION } from '../database/connection';

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
   * 1. Angle & distance sorting relative to shop (Polar coordinates clustering)
   * 2. Partition into clusters of at most 3 orders (rider limit)
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

    // 1. Prepare order points with angle from shop
    const orderItems = orders.map(o => {
      const lat = o.lat ?? shop.lat;
      const lng = o.lng ?? shop.lng;
      const dLat = lat - shop.lat;
      const dLng = lng - shop.lng;
      // Angle in radians [-PI, PI] shifted by seed if recalculating
      let angle = Math.atan2(dLat, dLng) + (strategySeed * 0.15);
      const distFromShop = calculateDistanceKm(shop.lat, shop.lng, lat, lng);
      return {
        order: o,
        lat,
        lng,
        angle,
        distFromShop
      };
    });

    // Sort radially around shop to naturally cluster nearby orders in sectors
    orderItems.sort((a, b) => a.angle - b.angle || a.distFromShop - b.distFromShop);

    // Group into clusters of max 3 orders
    const clusters: (typeof orderItems)[] = [];
    let currentCluster: typeof orderItems = [];

    for (const item of orderItems) {
      if (currentCluster.length < 3) {
        currentCluster.push(item);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Available active riders (up to 13)
    const activeRiders = riders.filter(r => r.status === 'active');
    const riderRoutes: RiderRoute[] = [];

    // Assign clusters to riders
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
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
