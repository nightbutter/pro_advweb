import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { RiderApi } from '../../services/api/rider-api';
import { RoutePlanApi } from '../../services/api/route-plan-api';
import { Auth } from '../../services/auth';
import { Rider } from '../../model/rider';
import { RiderRoute } from '../../model/route-plan';
import { APP_ICONS } from '../../shared/icons';

@Component({
  selector: 'app-rider-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './rider-portal.html',
  styleUrl: './rider-portal.css',
})
export class RiderPortal implements OnInit {
  private riderApi = inject(RiderApi);
  private routePlanApi = inject(RoutePlanApi);
  auth = inject(Auth); // ใช้ใน html (auth.isAdmin())
  readonly icons = APP_ICONS;

  jobInput: string = '1';
  allRiders: Rider[] = [];
  currentRoute: RiderRoute | null = null;
  errorMessage: string = '';
  loading = false;

  ngOnInit() {
    const user = this.auth.user();
    if (user?.role === 'rider' && user.riderId) {
      // ไรเดอร์ดูได้เฉพาะใบงานของตัวเอง
      this.jobInput = user.riderId.toString();
    } else {
      this.loadRiders();
    }
    this.searchJob();
  }

  async loadRiders() {
    this.allRiders = await this.riderApi.getRiders();
  }

  async searchJob() {
    if (!this.jobInput.trim()) return;
    this.errorMessage = '';
    this.loading = true;

    try {
      const res = await this.routePlanApi.getRiderRoute(this.jobInput.trim());
      this.currentRoute = res.route;
    } catch (err) {
      this.currentRoute = null;
      this.errorMessage =
        (err instanceof HttpErrorResponse && err.error?.error) || 'ไม่พบข้อมูลใบงานนี้ กรุณาตรวจสอบหมายเลขอีกครั้ง';
    } finally {
      this.loading = false;
    }
  }

  selectRider(riderId: number) {
    this.jobInput = riderId.toString();
    this.searchJob();
  }

  getGoogleMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  /** จำนวนจุดส่งจริง (ไม่นับร้าน) */
  get deliveryCount(): number {
    return this.currentRoute?.waypoints.filter((w) => w.type === 'delivery').length ?? 0;
  }
}
