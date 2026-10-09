import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { CustomerNearby, OrderNearby } from '../../models/types';
import { parseCoordinates } from '../../utils/coords';
import * as L from 'leaflet';

interface SearchState<T> {
  lat: string;
  lng: string;
  loading: boolean;
  error: string;
  searched: boolean;
  center: { lat: number; lng: number } | null;
  radiusMeters: number;
  results: T[];
  count: number;
}

@Component({
  selector: 'app-geo-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="geo-container">
      <div class="header-section">
        <h2>📍 ค้นหาตามพิกัดภูมิศาสตร์ (HW-5)</h2>
        <p class="subtitle">ระบุละติจูด/ลองจิจูด แล้วค้นหาลูกค้าในรัศมี 1 กม. หรือออเดอร์ในรัศมี 2 กม.</p>
      </div>

      <div class="search-grid">
        <!-- ==================== Customers within 1 km ==================== -->
        <div class="card">
          <div class="card-header">
            <h3>👥 ค้นหาลูกค้าในรัศมี 1 กิโลเมตร</h3>
          </div>
          <div class="coord-form">
            <div class="form-group">
              <label>Latitude (ละติจูด) <span class="req">*</span></label>
              <input type="text" inputmode="decimal" [(ngModel)]="cust.lat" placeholder="เช่น 16.2465" />
            </div>
            <div class="form-group">
              <label>Longitude (ลองจิจูด) <span class="req">*</span></label>
              <input type="text" inputmode="decimal" [(ngModel)]="cust.lng" placeholder="เช่น 103.2505" />
            </div>
            <div class="form-actions">
              <button class="btn btn-secondary" type="button" (click)="useShopCoords('cust')">🏠 พิกัดร้าน</button>
              <button class="btn btn-primary" type="button" (click)="searchCustomers()" [disabled]="cust.loading">
                {{ cust.loading ? '⏳ กำลังค้นหา...' : '🔍 ค้นหาลูกค้า (1 กม.)' }}
              </button>
            </div>
          </div>

          <div class="state-msg error" *ngIf="cust.error">⚠️ {{ cust.error }}</div>
          <div class="state-msg searched-info" *ngIf="cust.searched && cust.center">
            📍 พิกัดที่ค้นหา: {{ cust.center.lat }}, {{ cust.center.lng }} — รัศมี 1 กม.
          </div>
          <div class="state-msg empty" *ngIf="cust.searched && !cust.loading && !cust.error && cust.count === 0">
            ไม่พบลูกค้าในรัศมี 1 กม. จากพิกัดนี้
          </div>
          <div class="result-count" *ngIf="cust.count > 0">พบ {{ cust.count }} คน</div>
          <ul class="result-list" *ngIf="cust.count > 0">
            <li *ngFor="let c of cust.results" class="result-item">
              <div class="result-main">
                <span class="font-bold">{{ c.name }}</span>
                <span class="badge badge-dist">{{ c.distanceMeters }} ม.</span>
              </div>
              <div class="result-sub">#{{ c.id }} • 📞 {{ c.phone }}</div>
              <div class="result-sub">📍 {{ c.address }}</div>
              <div class="result-sub coord">{{ c.lat.toFixed(4) }}, {{ c.lng.toFixed(4) }}</div>
            </li>
          </ul>
        </div>

        <!-- ==================== Orders within 2 km ==================== -->
        <div class="card">
          <div class="card-header">
            <h3>📦 ค้นหาออเดอร์ในรัศมี 2 กิโลเมตร</h3>
          </div>
          <div class="coord-form">
            <div class="form-group">
              <label>Latitude (ละติจูด) <span class="req">*</span></label>
              <input type="text" inputmode="decimal" [(ngModel)]="ord.lat" placeholder="เช่น 16.2465" />
            </div>
            <div class="form-group">
              <label>Longitude (ลองจิจูด) <span class="req">*</span></label>
              <input type="text" inputmode="decimal" [(ngModel)]="ord.lng" placeholder="เช่น 103.2505" />
            </div>
            <div class="form-actions">
              <button class="btn btn-secondary" type="button" (click)="useShopCoords('ord')">🏠 พิกัดร้าน</button>
              <button class="btn btn-primary" type="button" (click)="searchOrders()" [disabled]="ord.loading">
                {{ ord.loading ? '⏳ กำลังค้นหา...' : '🔍 ค้นหาออเดอร์ (2 กม.)' }}
              </button>
            </div>
          </div>

          <div class="state-msg error" *ngIf="ord.error">⚠️ {{ ord.error }}</div>
          <div class="state-msg searched-info" *ngIf="ord.searched && ord.center">
            📍 พิกัดที่ค้นหา: {{ ord.center.lat }}, {{ ord.center.lng }} — รัศมี 2 กม.
          </div>
          <div class="state-msg empty" *ngIf="ord.searched && !ord.loading && !ord.error && ord.count === 0">
            ไม่พบออเดอร์ในรัศมี 2 กม. จากพิกัดนี้
          </div>
          <div class="result-count" *ngIf="ord.count > 0">พบ {{ ord.count }} ออเดอร์</div>
          <ul class="result-list" *ngIf="ord.count > 0">
            <li *ngFor="let o of ord.results" class="result-item">
              <div class="result-main">
                <span class="font-bold">{{ o.orderNumber }}</span>
                <span class="badge badge-dist">{{ o.distanceMeters }} ม.</span>
              </div>
              <div class="result-sub">#{{ o.id }} • {{ o.customerName }} • 📦 {{ o.boxCount }} กล่อง</div>
              <div class="result-sub">📍 {{ o.customerAddress }}</div>
              <div class="result-sub coord" *ngIf="o.lat != null">{{ o.lat!.toFixed(4) }}, {{ o.lng!.toFixed(4) }}</div>
            </li>
          </ul>
        </div>
      </div>

      <!-- ==================== Result Map ==================== -->
      <div class="card map-card">
        <div class="card-header">
          <h3>🗺️ แผนที่ผลการค้นหา</h3>
          <div class="legend" *ngIf="mapMode">
            <span class="legend-item"><span class="dot center-dot"></span> จุดค้นหา</span>
            <span class="legend-item" *ngIf="mapMode === 'customers'"><span class="dot cust-dot"></span> ลูกค้า (1 กม.)</span>
            <span class="legend-item" *ngIf="mapMode === 'orders'"><span class="dot ord-dot"></span> ออเดอร์ (2 กม.)</span>
          </div>
        </div>
        <div id="geo-map" class="map-view"></div>
        <p class="map-hint" *ngIf="!mapMode">ทำการค้นหาจากแผงด้านบนเพื่อแสดงจุดค้นหาและผลลัพธ์บนแผนที่</p>
      </div>
    </div>
  `,
  styles: [`
    .geo-container { display: flex; flex-direction: column; gap: 20px; }
    .header-section h2 { margin: 0; font-size: 22px; color: #0f172a; }
    .subtitle { margin: 4px 0 0; color: #64748b; font-size: 13px; }
    .search-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 20px;
    }
    .card {
      background: #fff;
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.06);
      overflow: hidden;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border, #e2e8f0);
      flex-wrap: wrap;
      gap: 8px;
    }
    .card-header h3 { margin: 0; font-size: 15px; color: #0f172a; }
    .coord-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 16px 18px;
    }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 13px; font-weight: 600; color: #334155; }
    .req { color: #ef4444; }
    .form-group input {
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
    }
    .form-group input:focus { outline: 2px solid #fdba74; border-color: #f97316; }
    .form-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 9px 16px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary { background: #f97316; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #ea580c; }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
    .btn-secondary:hover { background: #e2e8f0; }
    .state-msg { margin: 0 18px 12px; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
    .state-msg.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .state-msg.searched-info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .state-msg.empty { background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; }
    .result-count { padding: 0 18px 8px; font-size: 13px; font-weight: 600; color: #15803d; }
    .result-list {
      list-style: none;
      margin: 0;
      padding: 0 18px 16px;
      max-height: 340px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .result-item {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #fbfdff;
    }
    .result-main { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .font-bold { font-weight: 600; color: #0f172a; }
    .badge-dist {
      background: #ffedd5;
      color: #c2410c;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .result-sub { font-size: 12.5px; color: #64748b; margin-top: 2px; }
    .result-sub.coord { font-family: ui-monospace, monospace; color: #94a3b8; }
    .map-card .map-view { height: 380px; width: 100%; }
    .map-hint { margin: 0; padding: 12px 18px; font-size: 13px; color: #94a3b8; }
    .legend { display: flex; gap: 14px; font-size: 12.5px; color: #475569; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .center-dot { background: #dc2626; }
    .cust-dot { background: #f97316; }
    .ord-dot { background: #0284c7; }
    @media (max-width: 768px) {
      .coord-form { grid-template-columns: 1fr; }
      .map-card .map-view { height: 300px; }
    }
  `]
})
export class GeoSearchComponent implements AfterViewInit, OnDestroy {
  cust: SearchState<CustomerNearby> = this.newState(1000);
  ord: SearchState<OrderNearby> = this.newState(2000);

  private map?: L.Map;
  private searchLayer = L.layerGroup();
  mapMode: 'customers' | 'orders' | null = null;

  constructor(private api: ApiService) {}

  private newState(radiusMeters: number): SearchState<any> {
    return { lat: '', lng: '', loading: false, error: '', searched: false, center: null, radiusMeters, results: [], count: 0 };
  }

  ngAfterViewInit() {
    this.map = L.map('geo-map').setView([16.2465, 103.2505], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
    this.searchLayer.addTo(this.map);
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  useShopCoords(which: 'cust' | 'ord') {
    this[which].lat = '16.2465';
    this[which].lng = '103.2505';
  }

  searchCustomers() {
    const parsed = parseCoordinates(this.cust.lat, this.cust.lng);
    if ('error' in parsed) {
      this.cust.error = parsed.error;
      return;
    }
    if (this.cust.loading) return;
    const { lat, lng } = parsed.coords;
    this.cust.loading = true;
    this.cust.error = '';
    this.api.getCustomersNearby(lat, lng).subscribe({
      next: res => {
        this.cust.results = res.customers;
        this.cust.count = res.count;
        this.cust.center = { lat, lng };
        this.cust.searched = true;
        this.cust.loading = false;
        this.renderSearchOnMap('customers', lat, lng);
      },
      error: () => {
        this.cust.error = 'ค้นหาไม่สำเร็จ — ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่';
        this.cust.loading = false;
      }
    });
  }

  searchOrders() {
    const parsed = parseCoordinates(this.ord.lat, this.ord.lng);
    if ('error' in parsed) {
      this.ord.error = parsed.error;
      return;
    }
    if (this.ord.loading) return;
    const { lat, lng } = parsed.coords;
    this.ord.loading = true;
    this.ord.error = '';
    this.api.getOrdersNearby(lat, lng).subscribe({
      next: res => {
        this.ord.results = res.orders;
        this.ord.count = res.count;
        this.ord.center = { lat, lng };
        this.ord.searched = true;
        this.ord.loading = false;
        this.renderSearchOnMap('orders', lat, lng);
      },
      error: () => {
        this.ord.error = 'ค้นหาไม่สำเร็จ — ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่';
        this.ord.loading = false;
      }
    });
  }

  private renderSearchOnMap(mode: 'customers' | 'orders', lat: number, lng: number) {
    if (!this.map) return;
    this.mapMode = mode;
    this.searchLayer.clearLayers();

    const state = mode === 'customers' ? this.cust : this.ord;

    // Search center marker
    const centerIcon = L.divIcon({ html: '📍', className: 'geo-center-marker', iconSize: [30, 30], iconAnchor: [15, 30] });
    L.marker([lat, lng], { icon: centerIcon })
      .addTo(this.searchLayer)
      .bindPopup(`<b>จุดค้นหา</b><br>${lat}, ${lng}`);

    // Radius circle (1 km customers / 2 km orders)
    L.circle([lat, lng], {
      radius: state.radiusMeters,
      color: mode === 'customers' ? '#f97316' : '#0284c7',
      weight: 2,
      fillOpacity: 0.05
    }).addTo(this.searchLayer);

    const color = mode === 'customers' ? '#f97316' : '#0284c7';
    for (const r of state.results) {
      if (r.lat == null || r.lng == null) continue;
      const label = mode === 'customers'
        ? `<b>${(r as CustomerNearby).name}</b><br>📍 ${(r as CustomerNearby).address}<br>ระยะ ${r.distanceMeters} ม.`
        : `<b>${(r as OrderNearby).orderNumber}</b><br>${(r as OrderNearby).customerName} • 📦 ${(r as OrderNearby).boxCount} กล่อง<br>ระยะ ${r.distanceMeters} ม.`;
      L.circleMarker([r.lat, r.lng], {
        radius: 8, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
      }).addTo(this.searchLayer).bindPopup(label);
    }

    const points: L.LatLngExpression[] = [[lat, lng], ...state.results.filter(r => r.lat != null && r.lng != null).map(r => [r.lat!, r.lng!] as L.LatLngExpression)];
    this.map.fitBounds(L.latLngBounds(points).pad(0.15));
  }
}
