export interface Rider {
  id: number;
  name: string;
  phone: string;
  color: string;
  maxOrders: number;
  status: 'active' | 'inactive';
}
