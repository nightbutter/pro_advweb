import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { RouteOptimizationResult, RiderRoute } from '../../models/types';
import * as L from 'leaflet';

@Component({
  selector: 'app-routes-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="routes-container">
      <!-- Header Controls -->
      <div class="header-section">
        <div>
          <h2>🗺️ ระบบจัดเส้นทางและแบ่งงานไรเดอร์อัจฉริยะ (Smart Dispatch)</h2>
          <p class="subtitle">ส่งด่วนมื้อเที่ยง 11:30 - 12:30 น. (ภายใน 1 ชม.) | ไรเดอร์ประจำ 13 คน (รับคนละไม่เกิน 3 ออเดอร์)</p>
        </div>

        <div class="action-buttons">
          <button class="btn btn-primary recalculate-btn" (click)="recalculateRoutes()">
            <span>⚡ คำนวณเส้นทางใหม่</span>
          </button>
        </div>
      </div>

      <!-- Financial & KPI Summary Dashboard -->
      <div class="summary-cards" *ngIf="planResult?.summary">
        <div class="kpi-card profit-card" [class.loss-card]="planResult.summary.netProfit < 0">
          <div class="kpi-label">กำไรสุทธิมื้อเที่ยงนี้</div>
          <div class="kpi-val">{{ planResult.summary.netProfit | number:'1.2-2' }} ฿</div>
          <div class="kpi-sub">
            อัตรากำไร: <strong>{{ planResult.summary.profitMarginPercent }}%</strong>
            <span class="badge" [class.badge-success]="planResult.summary.profitMarginPercent >= 24" [class.badge-warning]="planResult.summary.profitMarginPercent < 24">
              {{ planResult.summary.profitMarginPercent >= 24 ? '✅ ตามเป้า 24-25%' : '⚠️ ต่ำกว่าเป้า' }}
            </span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">รายได้รวม (65฿/กล่อง)</div>
          <div class="kpi-val text-primary">{{ planResult.summary.totalRevenue | number:'1.0-0' }} ฿</div>
          <div class="kpi-sub">ข้าวกล่องทั้งหมด {{ planResult.summary.totalBoxes }} กล่อง</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">ต้นทุนค่าส่งไรเดอร์</div>
          <div class="kpi-val text-warning">{{ planResult.summary.totalDeliveryCost | number:'1.2-2' }} ฿</div>
          <div class="kpi-sub">ระยะทางรวม {{ planResult.summary.totalDistanceKm }} กม.</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">ต้นทุนค่าอาหาร (40฿/กล่อง)</div>
          <div class="kpi-val text-muted">{{ planResult.summary.totalFoodCost | number:'1.0-0' }} ฿</div>
          <div class="kpi-sub">{{ planResult.summary.totalOrders }} ออเดอร์</div>
        </div>

        <div class="kpi-card time-card" [class.late-bg]="!planResult.summary.allOnTime">
          <div class="kpi-label">สถานะเวลาส่งมอบ</div>
          <div class="kpi-val text-success" *ngIf="planResult.summary.allOnTime">
            ⏱️ ทัน 12:30 น. (100%)
          </div>
          <div class="kpi-val text-danger" *ngIf="!planResult.summary.allOnTime">
            ⚠️ เสี่ยงส่งเกิน 12:30 น.
          </div>
          <div class="kpi-sub">ใช้ไรเดอร์ {{ planResult.summary.assignedRidersCount }} จาก 13 คน</div>
        </div>
      </div>

      <!-- Main Layout: Map & Rider Cards -->
      <div class="main-layout">
        <!-- Interactive Map Section -->
        <div class="card map-card">
          <div class="map-header">
            <h3>แผนที่เส้นทางจัดส่งแยกสีตามไรเดอร์ (13 สี)</h3>
            <div class="map-controls">
              <span class="legend-hint">💡 คลิกที่เส้นหรือชื่อไรเดอร์เพื่อเน้นเส้นทางเฉพาะคน</span>
              <button class="btn btn-secondary btn-sm" (click)="resetMapView()">🎯 รีเซ็ตมุมมอง</button>
            </div>
          </div>
          <div id="routing-map" class="map-view"></div>
        </div>

        <!-- Rider Allocation Details Sidebar -->
        <div class="riders-sidebar">
          <div class="sidebar-header">
            <h3>📋 ใบงานแบ่งงานไรเดอร์ ({{ planResult?.routes?.length || 0 }} คนที่ได้รับงาน)</h3>
          </div>

          <div class="rider-cards-scroll">
            <div 
              *ngFor="let route of planResult?.routes" 
              class="rider-work-card"
              [class.highlighted]="selectedRiderId === route.riderId"
              [style.borderLeftColor]="route.color"
              (click)="highlightRider(route)"
            >
              <div class="rider-card-top">
                <div class="rider-identity">
                  <span class="color-badge" [style.backgroundColor]="route.color"></span>
                  <div>
                    <h4 class="rider-name">{{ route.riderName }}</h4>
                    <span class="job-tag">รหัสใบงาน: {{ route.jobCode }}</span>
                  </div>
                </div>
                <div class="finish-time" [class.late]="route.isLate">
                  <span class="time-label">ถึงไม่เกิน</span>
                  <strong>{{ route.estimatedFinishTime }} น.</strong>
                </div>
              </div>

              <!-- Metrics inside rider card -->
              <div class="rider-metrics-grid">
                <div class="rm-item">
                  <span>กล่อง:</span> <strong>{{ route.totalBoxes }} กล่อง</strong>
                </div>
                <div class="rm-item">
                  <span>ระยะทาง:</span> <strong>{{ route.totalDistanceKm }} กม.</strong>
                </div>
                <div class="rm-item">
                  <span>ค่าส่ง:</span> <strong>{{ route.totalDeliveryCost | number:'1.1-1' }} ฿</strong>
                </div>
                <div class="rm-item">
                  <span>กำไรสุทธิ:</span> <strong class="profit-highlight">{{ route.netProfit | number:'1.1-1' }} ฿</strong>
                </div>
              </div>

              <!-- Sequence stops -->
              <div class="stops-timeline">
                <div class="stop-step" *ngFor="let wp of route.waypoints">
                  <div class="step-bullet" [class.shop-bullet]="wp.type === 'shop'">
                    {{ wp.type === 'shop' ? '🏠' : wp.stepNumber }}
                  </div>
                  <div class="step-info">
                    <div class="step-time">{{ wp.estimatedArrival }} น.</div>
                    <div class="step-name">{{ wp.customerName }}</div>
                    <div class="step-desc" *ngIf="wp.type === 'delivery'">
                      🍱 {{ wp.boxCount }} กล่อง • {{ wp.customerAddress }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .routes-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 4px;
    }
    .recalculate-btn {
      font-size: 15px;
      padding: 12px 24px;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      box-shadow: 0 4px 12px rgba(234, 88, 12, 0.35);
    }
    .recalculate-btn:hover {
      box-shadow: 0 6px 16px rgba(234, 88, 12, 0.45);
      transform: translateY(-1px);
    }
    /* Summary Cards */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .kpi-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow-sm);
    }
    .profit-card {
      background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
      border-color: #86efac;
    }
    .profit-card.loss-card {
      background: linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%);
      border-color: #fca5a5;
    }
    .kpi-label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
      margin-bottom: 4px;
    }
    .kpi-val {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-main);
    }
    .kpi-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .text-primary { color: #f97316; }
    .text-warning { color: #d97706; }
    .text-success { color: #059669; }
    .text-danger { color: #dc2626; }
    .text-muted { color: #64748b; }
    .late-bg {
      background: #fef2f2 !important;
      border-color: #fca5a5 !important;
    }
    /* Main Layout */
    .main-layout {
      display: grid;
      grid-template-columns: 1fr 420px;
      gap: 16px;
      height: calc(100vh - 270px);
      min-height: 560px;
    }
    @media (max-width: 1024px) {
      .main-layout {
        grid-template-columns: 1fr;
        height: auto;
      }
    }
    .map-card {
      display: flex;
      flex-direction: column;
      padding: 16px;
      height: 100%;
    }
    .map-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .map-header h3 {
      font-size: 15px;
      font-weight: 600;
    }
    .legend-hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-right: 10px;
    }
    .map-view {
      flex: 1;
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      min-height: 440px;
      z-index: 0;
    }
    /* Sidebar */
    .riders-sidebar {
      background: white;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-header h3 {
      font-size: 15px;
      font-weight: 600;
    }
    .rider-cards-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .rider-work-card {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-left-width: 6px;
      border-radius: 8px;
      padding: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .rider-work-card:hover {
      background: #f1f5f9;
      transform: translateY(-2px);
      box-shadow: var(--shadow-sm);
    }
    .rider-work-card.highlighted {
      background: #fff7ed;
      border-color: #f97316;
      box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
    }
    .rider-card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .rider-identity {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .color-badge {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      display: inline-block;
    }
    .rider-name {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .job-tag {
      font-size: 11px;
      color: #64748b;
      background: #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .finish-time {
      text-align: right;
    }
    .time-label {
      font-size: 10px;
      color: #64748b;
      display: block;
    }
    .finish-time strong {
      font-size: 13px;
      color: #059669;
    }
    .finish-time.late strong {
      color: #dc2626;
    }
    .rider-metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: white;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      border: 1px solid #edf2f7;
      margin-bottom: 12px;
    }
    .rm-item span {
      color: var(--text-muted);
    }
    .profit-highlight {
      color: #059669;
    }
    /* Timeline */
    .stops-timeline {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px dashed var(--border);
      padding-top: 10px;
    }
    .stop-step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 12px;
    }
    .step-bullet {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .shop-bullet {
      background: #ea580c;
    }
    .step-time {
      font-weight: 600;
      color: #475569;
      font-size: 11px;
    }
    .step-name {
      font-weight: 500;
      color: #1e293b;
    }
    .step-desc {
      color: #64748b;
      font-size: 11px;
    }
  `]
})
export class RoutesViewComponent implements OnInit, AfterViewInit, OnDestroy {
  planResult!: RouteOptimizationResult;
  selectedRiderId: number | null = null;
  private calculationSeed = 0;

  private map?: L.Map;
  private routeLayers = L.layerGroup();
  private markerLayers = L.layerGroup();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadCurrentPlan();
  }

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap() {
    this.map = L.map('routing-map').setView([16.2465, 103.2505], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.routeLayers.addTo(this.map);
    this.markerLayers.addTo(this.map);

    // Initial draw once plan is loaded
    if (this.planResult) {
      this.renderMap();
    }
  }

  loadCurrentPlan() {
    this.api.getCurrentRoutePlan().subscribe(res => {
      this.planResult = res;
      this.renderMap();
    });
  }

  recalculateRoutes() {
    this.calculationSeed += 1;
    this.api.recalculateRoutes(this.calculationSeed).subscribe(res => {
      this.planResult = res;
      this.selectedRiderId = null;
      this.renderMap();
    });
  }

  private renderMap() {
    if (!this.map || !this.planResult) return;

    this.routeLayers.clearLayers();
    this.markerLayers.clearLayers();

    // 1. Draw Shop marker
    const shop = this.planResult.shopLocation;
    const shopIcon = L.divIcon({
      html: '🏠',
      className: 'custom-shop-marker',
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });
    L.marker([shop.lat, shop.lng], { icon: shopIcon })
      .addTo(this.markerLayers)
      .bindPopup(`<b>${shop.name}</b><br>จุดเริ่มต้นออกส่ง 11:30 น.`);

    // 2. Draw each rider route with distinct line and markers
    this.planResult.routes.forEach(route => {
      const isSelected = this.selectedRiderId === null || this.selectedRiderId === route.riderId;
      const opacity = isSelected ? 0.9 : 0.2;
      const weight = isSelected ? (this.selectedRiderId === route.riderId ? 6 : 4) : 2;

      const latlngs: [number, number][] = route.waypoints.map(wp => [wp.lat, wp.lng]);

      // Route line
      const polyline = L.polyline(latlngs, {
        color: route.color,
        weight,
        opacity,
        dashArray: isSelected ? undefined : '5, 5'
      });

      polyline.bindPopup(`
        <div style="font-family: inherit;">
          <b style="color:${route.color};">${route.riderName}</b><br>
          📦 กล่อง: ${route.totalBoxes} กล่อง<br>
          📍 ระยะทาง: ${route.totalDistanceKm} กม.<br>
          ⏱️ ถึงเสร็จ: ${route.estimatedFinishTime} น.<br>
          💵 กำไร: <b>${route.netProfit} ฿</b>
        </div>
      `);

      polyline.on('click', () => {
        this.highlightRider(route);
      });

      this.routeLayers.addLayer(polyline);

      // Customer delivery waypoints
      route.waypoints.forEach(wp => {
        if (wp.type === 'delivery') {
          const markerHtml = `
            <div style="
              background:${route.color};
              width:26px;
              height:26px;
              border-radius:50%;
              color:white;
              font-weight:700;
              display:flex;
              align-items:center;
              justify-content:center;
              border:2px solid white;
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
              font-size:12px;
            ">${wp.stepNumber}</div>
          `;

          const customIcon = L.divIcon({
            html: markerHtml,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });

          const m = L.marker([wp.lat, wp.lng], { icon: customIcon });
          m.bindPopup(`
            <div style="font-family: inherit;">
              <b>จุดส่งที่ ${wp.stepNumber}: ${wp.customerName}</b><br>
              🍱 จำนวน: ${wp.boxCount} กล่อง<br>
              ⏰ เวลาถึงโดยประมาณ: <b>${wp.estimatedArrival} น.</b><br>
              📍 ที่อยู่: ${wp.customerAddress}<br>
              🏍️ ผู้ส่ง: ${route.riderName}
            </div>
          `);

          m.on('click', () => {
            this.highlightRider(route);
          });

          this.markerLayers.addLayer(m);
        }
      });
    });
  }

  highlightRider(route: RiderRoute) {
    if (this.selectedRiderId === route.riderId) {
      this.selectedRiderId = null;
    } else {
      this.selectedRiderId = route.riderId;
    }
    this.renderMap();

    // Zoom slightly to the selected rider's points
    if (this.selectedRiderId && this.map) {
      const bounds = L.latLngBounds(route.waypoints.map(w => [w.lat, w.lng]));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  resetMapView() {
    this.selectedRiderId = null;
    this.renderMap();
    if (this.map) {
      this.map.setView([16.2465, 103.2505], 14);
    }
  }
}
