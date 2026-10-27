import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Api } from '../../config/api';
import { RiderRouteResponse, RouteOptimizationResult } from '../../model/route-plan';

@Injectable({
  providedIn: 'root',
})
export class RoutePlanApi {
  http = inject(HttpClient);
  api = inject(Api);
  apiEndpoint = this.api.API_ENDPOINT;

  /** แผนเส้นทางปัจจุบัน */
  public async getCurrentRoutePlan() {
    const url = `${this.apiEndpoint}/routes/current`;
    const response = await lastValueFrom(this.http.get(url));
    return response as RouteOptimizationResult;
  }

  /** คำนวณเส้นทางใหม่ */
  public async recalculateRoutes(seed: number = 0) {
    const url = `${this.apiEndpoint}/routes/optimize`;
    const response = await lastValueFrom(this.http.post(url, { seed }));
    return response as RouteOptimizationResult;
  }

  /** ใบงานของไรเดอร์ (ระบุเลขไรเดอร์ หรือรหัสใบงาน) */
  public async getRiderRoute(jobCodeOrId: string) {
    const url = `${this.apiEndpoint}/routes/rider/${jobCodeOrId}`;
    const response = await lastValueFrom(this.http.get(url));
    return response as RiderRouteResponse;
  }
}
