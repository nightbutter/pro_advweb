import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { RiderRoute, Rider } from '../../models/types';

@Component({
  selector: 'app-rider-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rider-portal-container">
      <!-- Top Mobile App Bar -->
      <div class="mobile-header">
        <div class="header-content">
          <div class="brand">
            <span class="logo">🏍️</span>
            <div>
              <h2>ใบงานไรเดอร์ (Rider Job Sheet)</h2>
              <p>ระบบนำทางและจัดส่งอาหารมื้อเที่ยง</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Job Number Input Box -->
      <div class="job-search-card card">
        <label for="jobCode">🔑 กรอกเลขใบงาน หรือ เลือกชื่อไรเดอร์</label>
        <div class="input-action-row">
          <input 
            id="jobCode"
            type="text" 
            [(ngModel)]="jobInput" 
            placeholder="เช่น 1, 2, TASK-01..." 
            (keyup.enter)="searchJob()"
          />
          <button class="btn btn-primary" (click)="searchJob()">
            ดูใบงาน
          </button>
        </div>

        <!-- Quick Select Buttons for the 13 Riders -->
        <div class="quick-riders">
          <span class="quick-label">เลือกด่วน (ไรเดอร์เบอร์ 1 - 13):</span>
          <div class="rider-tags">
            <button 
              *ngFor="let r of allRiders" 
              class="rider-chip"
              [class.active]="currentRoute?.riderId === r.id"
              [style.borderColor]="r.color"
              (click)="selectRider(r.id)"
            >
              <span class="chip-dot" [style.backgroundColor]="r.color"></span>
              เบอร์ {{ r.id }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading / Error Message -->
      <div *ngIf="errorMessage" class="error-banner">
        ⚠️ {{ errorMessage }}
      </div>

      <!-- Rider Job Detail Card (Clean mobile view) -->
      <div class="job-details-wrapper" *ngIf="currentRoute">
        <!-- Summary Banner -->
        <div class="summary-banner" [style.borderTopColor]="currentRoute.color">
          <div class="banner-main">
            <div>
              <span class="badge badge-info">{{ currentRoute.jobCode }}</span>
              <h3 class="rider-title">{{ currentRoute.riderName }}</h3>
              <p class="phone-text">📞 {{ currentRoute.riderPhone }}</p>
            </div>
            <div class="box-stat">
              <div class="stat-number">{{ currentRoute.totalBoxes }}</div>
              <div class="stat-desc">กล่องที่ต้องหยิบ</div>
            </div>
          </div>

          <div class="banner-strip">
            <div class="strip-item">
              <span>เวลาเริ่ม:</span>
              <strong>11:30 น.</strong>
            </div>
            <div class="strip-item">
              <span>ส่งเสร็จ:</span>
              <strong class="text-success">{{ currentRoute.estimatedFinishTime }} น.</strong>
            </div>
            <div class="strip-item">
              <span>ระยะทาง:</span>
              <strong>{{ currentRoute.totalDistanceKm }} กม.</strong>
            </div>
            <div class="strip-item">
              <span>ค่ารอบนี้:</span>
              <strong class="text-primary">{{ currentRoute.totalDeliveryCost | number:'1.0-0' }} ฿</strong>
            </div>
          </div>
        </div>

        <!-- Step-by-Step Delivery Stops List -->
        <div class="stops-section">
          <h4>📍 ลำดับจุดส่งตามเส้นทาง (วิ่งตามลำดับเพื่อความเร็วสูงสุด)</h4>

          <div class="stops-list">
            <div 
              *ngFor="let wp of currentRoute.waypoints" 
              class="stop-card"
              [class.shop-card]="wp.type === 'shop'"
            >
              <div class="stop-badge" [class.shop-badge]="wp.type === 'shop'">
                {{ wp.type === 'shop' ? '🏠' : 'จุดที่ ' + wp.stepNumber }}
              </div>

              <div class="stop-content">
                <div class="stop-time-row">
                  <span class="estimated-time">⏰ ถึงเวลา {{ wp.estimatedArrival }} น.</span>
                  <span class="dist-tag" *ngIf="wp.distanceFromPrevKm > 0">
                    ห่าง {{ wp.distanceFromPrevKm }} กม.
                  </span>
                </div>

                <div class="recipient-name">
                  {{ wp.customerName }}
                  <span *ngIf="wp.boxCount" class="box-count-tag">
                    🍱 ส่ง {{ wp.boxCount }} กล่อง
                  </span>
                </div>

                <div class="recipient-address">
                  📌 {{ wp.customerAddress }}
                </div>

                <div class="stop-actions" *ngIf="wp.type === 'delivery'">
                  <a 
                    *ngIf="wp.customerPhone" 
                    [href]="'tel:' + wp.customerPhone" 
                    class="btn btn-secondary btn-sm"
                  >
                    📞 โทรหาลูกค้า ({{ wp.customerPhone }})
                  </a>
                  <a 
                    [href]="getGoogleMapsUrl(wp.lat, wp.lng)" 
                    target="_blank" 
                    class="btn btn-primary btn-sm nav-btn"
                  >
                    🗺️ นำทางด้วย Google Maps
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Safety check footer -->
        <div class="job-footer card">
          <p>✅ เงื่อนไขสำคัญ: ห้ามส่งเกินเวลา <strong>12:30 น.</strong> เด็ดขาด! เพื่อไม่ให้ลูกค้าหมดเวลาพักเที่ยง</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .rider-portal-container {
      max-width: 680px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 40px;
    }
    .mobile-header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: white;
      padding: 16px 20px;
      border-radius: var(--radius);
      box-shadow: var(--shadow-md);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand .logo {
      font-size: 32px;
    }
    .brand h2 {
      font-size: 18px;
      font-weight: 700;
    }
    .brand p {
      font-size: 12px;
      color: #94a3b8;
    }
    .job-search-card label {
      font-size: 14px;
      font-weight: 600;
      color: #334155;
      display: block;
      margin-bottom: 8px;
    }
    .input-action-row {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }
    .input-action-row input {
      font-size: 16px;
      padding: 12px;
    }
    .quick-riders {
      border-top: 1px dashed var(--border);
      padding-top: 12px;
    }
    .quick-label {
      font-size: 12px;
      color: var(--text-muted);
      display: block;
      margin-bottom: 8px;
    }
    .rider-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .rider-chip {
      background: white;
      border: 1px solid var(--border);
      padding: 6px 10px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .rider-chip:hover, .rider-chip.active {
      background: #f8fafc;
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
    .chip-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .error-banner {
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #b91c1c;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
    }
    /* Summary Banner */
    .summary-banner {
      background: white;
      border: 1px solid var(--border);
      border-top: 6px solid #f97316;
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      margin-bottom: 16px;
    }
    .banner-main {
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
    }
    .rider-title {
      font-size: 18px;
      font-weight: 700;
      margin-top: 4px;
    }
    .phone-text {
      font-size: 13px;
      color: var(--text-muted);
    }
    .box-stat {
      text-align: center;
      background: #ffedd5;
      padding: 8px 16px;
      border-radius: 12px;
      border: 1px solid #fed7aa;
    }
    .stat-number {
      font-size: 26px;
      font-weight: 800;
      color: #ea580c;
    }
    .stat-desc {
      font-size: 11px;
      font-weight: 600;
      color: #9a3412;
    }
    .banner-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: #f8fafc;
      padding: 12px 16px;
      font-size: 12px;
      text-align: center;
      gap: 4px;
    }
    .strip-item span {
      display: block;
      color: var(--text-muted);
      font-size: 11px;
    }
    .strip-item strong {
      font-size: 13px;
    }
    /* Stops List */
    .stops-section h4 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #334155;
    }
    .stops-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .stop-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      box-shadow: var(--shadow-sm);
      position: relative;
    }
    .stop-card.shop-card {
      background: #fff7ed;
      border-color: #fed7aa;
    }
    .stop-badge {
      display: inline-block;
      background: #0284c7;
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .shop-badge {
      background: #ea580c;
    }
    .stop-time-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .estimated-time {
      font-weight: 600;
      color: #0f172a;
    }
    .dist-tag {
      font-size: 11px;
      color: var(--text-muted);
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .recipient-name {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .box-count-tag {
      background: #fee2e2;
      color: #b91c1c;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
    }
    .recipient-address {
      font-size: 13px;
      color: #475569;
      margin-bottom: 12px;
      line-height: 1.4;
    }
    .stop-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .nav-btn {
      background: #2563eb;
    }
    .nav-btn:hover {
      background: #1d4ed8;
    }
    .btn-sm {
      padding: 8px 12px;
      font-size: 12px;
      text-decoration: none;
    }
    .job-footer {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #065f46;
      font-size: 13px;
      text-align: center;
      padding: 12px;
    }
  `]
})
export class RiderPortalComponent implements OnInit {
  jobInput: string = '1';
  allRiders: Rider[] = [];
  currentRoute: RiderRoute | null = null;
  errorMessage: string = '';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadRiders();
    this.searchJob();
  }

  loadRiders() {
    this.api.getRiders().subscribe(data => {
      this.allRiders = data;
    });
  }

  searchJob() {
    if (!this.jobInput.trim()) return;
    this.errorMessage = '';

    this.api.getRiderRoute(this.jobInput.trim()).subscribe({
      next: (res) => {
        this.currentRoute = res.route;
      },
      error: (err) => {
        this.currentRoute = null;
        this.errorMessage = err.error?.error || 'ไม่พบข้อมูลใบงานนี้ กรุณาตรวจสอบหมายเลขอีกครั้ง';
      }
    });
  }

  selectRider(riderId: number) {
    this.jobInput = riderId.toString();
    this.searchJob();
  }

  getGoogleMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
}
