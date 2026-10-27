import { Zone } from './zones';

export interface Order {
  id?: number;
  orderNumber: string;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  zone?: Zone;
  lat?: number;
  lng?: number;
  boxCount: number;
  orderTime?: string;
  status?: 'pending' | 'assigned' | 'delivered';
  assignedRiderId?: number;
  deliverySequence?: number;
}
