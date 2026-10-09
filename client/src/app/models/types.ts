export interface Customer {
  id?: number;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Order {
  id?: number;
  orderNumber: string;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  lat?: number;
  lng?: number;
  boxCount: number;
  orderTime?: string;
  status?: 'pending' | 'assigned' | 'delivered';
  assignedRiderId?: number;
  deliverySequence?: number;
}

export interface Rider {
  id: number;
  name: string;
  phone: string;
  color: string;
  maxOrders: number;
  status: 'active' | 'inactive';
}

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
  };
  shopLocation: {
    lat: number;
    lng: number;
    name: string;
  };
}
