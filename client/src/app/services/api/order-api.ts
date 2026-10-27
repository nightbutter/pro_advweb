import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Api } from '../../config/api';
import { Order } from '../../model/order';

@Injectable({
  providedIn: 'root',
})
export class OrderApi {
  http = inject(HttpClient);
  api = inject(Api);
  apiEndpoint = this.api.API_ENDPOINT;

  public async getOrders() {
    const url = `${this.apiEndpoint}/orders`;
    const response = await lastValueFrom(this.http.get(url));
    return response as Order[];
  }

  public async createOrder(order: { customerId: number; boxCount: number }) {
    const url = `${this.apiEndpoint}/orders`;
    const response = await lastValueFrom(this.http.post(url, order));
    return response as Order;
  }

  public async updateOrder(id: number, order: { boxCount?: number; customerId?: number }) {
    const url = `${this.apiEndpoint}/orders/${id}`;
    const response = await lastValueFrom(this.http.put(url, order));
    return response as Order;
  }

  public async deleteOrder(id: number) {
    const url = `${this.apiEndpoint}/orders/${id}`;
    const response = await lastValueFrom(this.http.delete(url));
    return response as { success: boolean };
  }

  /** จำลองออเดอร์มื้อเที่ยง (ไม่ส่ง count = server สุ่ม 28-35 รายการ) */
  public async simulateOrders(count?: number) {
    const url = `${this.apiEndpoint}/orders/simulate`;
    const response = await lastValueFrom(this.http.post(url, { count }));
    return response as { message: string; orders: Order[] };
  }

  /** ล้างออเดอร์ทั้งหมด */
  public async clearOrders() {
    const url = `${this.apiEndpoint}/orders`;
    const response = await lastValueFrom(this.http.delete(url));
    return response as { success: boolean };
  }
}
