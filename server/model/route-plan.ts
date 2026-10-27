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
  zone: Zone; // delivery zone this route covers
  jobCode: string; // e.g. "RD-01" or date based
  totalBoxes: number;
  orderCount: number;
  orders: Order[];
  waypoints: RoutePoint[];
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFinishTime: string;
  baseDeliveryFee: number; // 15 baht
  distanceBoxFee: number; // 2 baht * distance * boxes
  totalDeliveryCost: number; // base + distanceBoxFee
  totalRevenue: number; // 65 * totalBoxes
  totalFoodCost: number; // 40 * totalBoxes
  netProfit: number; // Revenue - FoodCost - DeliveryCost
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
    onTimeDeliveryRate: number; // percentage <= 12:30
    allOnTime: boolean;
  };
  shopLocation: {
    lat: number;
    lng: number;
    name: string;
  };
}
