import { Zone } from './zones';
import { Order } from './order';

export interface RoutePoint {
  orderId?: number;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  lat: number;
  lng: number;
  boxCount?: number;
  type: 'shop' | 'delivery';
  stepNumber: number;
  distanceFromPrevKm: number;
  estimatedArrival: string;
}

export interface RiderRoute {
  riderId: number;
  riderName: string;
  riderPhone: string;
  color: string;
  zone: Zone;
  jobCode: string;
  totalBoxes: number;
  orderCount: number;
  orders: Order[];
  waypoints: RoutePoint[];
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFinishTime: string;
  baseDeliveryFee: number;
  distanceBoxFee: number;
  totalDeliveryCost: number;
  totalRevenue: number;
  totalFoodCost: number;
  netProfit: number;
  profitMarginPercent: number;
  isLate: boolean;
}

export interface RouteOptimizationResult {
  routes: RiderRoute[];
  summary: {
    totalOrders: number;
    totalBoxes: number;
    assignedRidersCount: number;
    totalDistanceKm: number;
    totalDeliveryCost: number;
    totalRevenue: number;
    totalFoodCost: number;
    netProfit: number;
    profitMarginPercent: number;
    onTimeDeliveryRate: number;
    allOnTime: boolean;
    distanceSource?: 'road' | 'straight';
    outOfRangeOrders?: OutOfRangeOrder[];
  };
  shopLocation: {
    lat: number;
    lng: number;
    name: string;
  };
}

export interface OutOfRangeOrder {
  orderId?: number;
  orderNumber?: string;
  customerName?: string;
  distanceKm: number;
}
