import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Api } from '../../config/api';
import { Customer } from '../../model/customer';

@Injectable({
  providedIn: 'root',
})
export class CustomerApi {
  http = inject(HttpClient);
  api = inject(Api);
  apiEndpoint = this.api.API_ENDPOINT;

  public async getCustomers() {
    const url = `${this.apiEndpoint}/customers`;
    const response = await lastValueFrom(this.http.get(url));
    return response as Customer[];
  }

  public async getCustomer(id: number) {
    const url = `${this.apiEndpoint}/customers/${id}`;
    const response = await lastValueFrom(this.http.get(url));
    return response as Customer;
  }

  public async createCustomer(customer: Customer) {
    const url = `${this.apiEndpoint}/customers`;
    const response = await lastValueFrom(this.http.post(url, customer));
    return response as Customer;
  }

  public async updateCustomer(id: number, customer: Customer) {
    const url = `${this.apiEndpoint}/customers/${id}`;
    const response = await lastValueFrom(this.http.put(url, customer));
    return response as Customer;
  }

  public async deleteCustomer(id: number) {
    const url = `${this.apiEndpoint}/customers/${id}`;
    const response = await lastValueFrom(this.http.delete(url));
    return response as { success: boolean };
  }
}
