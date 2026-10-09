import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Customer, Order, Rider, RouteOptimizationResult } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  // Customers
  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${this.baseUrl}/customers`);
  }

  getCustomer(id: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.baseUrl}/customers/${id}`);
  }

  createCustomer(customer: Customer): Observable<Customer> {
    return this.http.post<Customer>(`${this.baseUrl}/customers`, customer);
  }

  updateCustomer(id: number, customer: Customer): Observable<Customer> {
    return this.http.put<Customer>(`${this.baseUrl}/customers/${id}`, customer);
  }

  deleteCustomer(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/customers/${id}`);
  }

  // Orders
  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.baseUrl}/orders`);
  }

  createOrder(order: { customerId: number; boxCount: number }): Observable<Order> {
    return this.http.post<Order>(`${this.baseUrl}/orders`, order);
  }

  updateOrder(id: number, order: { boxCount?: number; customerId?: number }): Observable<Order> {
    return this.http.put<Order>(`${this.baseUrl}/orders/${id}`, order);
  }

  deleteOrder(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/orders/${id}`);
  }

  simulateOrders(count: number = 28): Observable<{ message: string; orders: Order[] }> {
    return this.http.post<{ message: string; orders: Order[] }>(`${this.baseUrl}/orders/simulate`, { count });
  }

  clearOrders(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/orders`);
  }

  // Riders
  getRiders(): Observable<Rider[]> {
    return this.http.get<Rider[]>(`${this.baseUrl}/riders`);
  }

  // Route Planning & Optimization
  getCurrentRoutePlan(): Observable<RouteOptimizationResult> {
    return this.http.get<RouteOptimizationResult>(`${this.baseUrl}/routes/current`);
  }

  recalculateRoutes(seed: number = 0): Observable<RouteOptimizationResult> {
    return this.http.post<RouteOptimizationResult>(`${this.baseUrl}/routes/optimize`, { seed });
  }

  getRiderRoute(jobCodeOrId: string): Observable<{ shopLocation: any; route: any }> {
    return this.http.get<{ shopLocation: any; route: any }>(`${this.baseUrl}/routes/rider/${jobCodeOrId}`);
  }
}
