import { Zone } from './zone';

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  zone?: Zone;
}
