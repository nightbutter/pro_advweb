import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Customer } from '../../models/types';
import * as L from 'leaflet';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="customers-container">
      <div class="header-section">
        <div>
          <h2>👥 จัดการข้อมูลลูกค้า (Customer Management)</h2>
          <p class="subtitle">บันทึกพิกัดตำแหน่งบ้าน/หอพักลูกค้าเพื่อจัดส่งข้าวกล่องได้อย่างแม่นยำ</p>
        </div>
        <button class="btn btn-primary" (click)="openAddModal()">
          <span>+ เพิ่มลูกค้าใหม่</span>
        </button>
      </div>

      <div class="content-grid">
        <!-- Customers Table -->
        <div class="card table-card">
          <div class="card-header">
            <h3>รายชื่อลูกค้าทั้งหมด ({{ customers.length }} คน)</h3>
            <div class="search-box">
              <input type="text" [(ngModel)]="searchTerm" placeholder="🔍 ค้นหาชื่อ หรือ เบอร์โทร..." />
            </div>
          </div>

          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>เบอร์โทรศัพท์</th>
                  <th>สถานที่ / หอพัก</th>
                  <th>พิกัด (Lat, Lng)</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let c of filteredCustomers; let i = index" [class.selected]="selectedCustomer?.id === c.id">
                  <td>{{ i + 1 }}</td>
                  <td class="font-bold">{{ c.name }}</td>
                  <td><a [href]="'tel:' + c.phone" class="phone-link">📞 {{ c.phone }}</a></td>
                  <td class="address-cell">{{ c.address }}</td>
                  <td>
                    <button class="coord-btn" (click)="focusOnMap(c)">
                      📍 {{ c.lat.toFixed(4) }}, {{ c.lng.toFixed(4) }}
                    </button>
                  </td>
                  <td>
                    <div class="action-buttons">
                      <button class="icon-btn edit" title="แก้ไข" (click)="editCustomer(c)">✏️</button>
                      <button class="icon-btn delete" title="ลบ" (click)="deleteCustomer(c)">🗑️</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Map Pinpoint helper -->
        <div class="card map-preview-card">
          <div class="card-header">
            <h3>🗺️ แผนที่พิกัดบ้านลูกค้า (คลิกบนแผนที่เพื่อระบุพิกัด)</h3>
            <span class="badge badge-info">ม.มหาสารคาม ขามเรียง</span>
          </div>
          <div id="customer-map" class="map-view"></div>
          <div class="map-hint" *ngIf="isModalOpen">
            💡 <strong>คำแนะนำ:</strong> สามารถคลิกบนแผนที่เพื่อเปลี่ยนจุดพิกัดในฟอร์มได้ทันที
          </div>
        </div>
      </div>

      <!-- Add/Edit Modal -->
      <div class="modal-backdrop" *ngIf="isModalOpen">
        <div class="modal-card">
          <div class="modal-header">
            <h3>{{ editMode ? '✏️ แก้ไขข้อมูลลูกค้า' : '➕ เพิ่มลูกค้าใหม่' }}</h3>
            <button class="close-btn" (click)="closeModal()">✕</button>
          </div>
          <form (ngSubmit)="saveCustomer()">
            <div class="form-group">
              <label>ชื่อลูกค้า / หอพัก <span class="req">*</span></label>
              <input type="text" [(ngModel)]="formCustomer.name" name="name" required placeholder="เช่น คุณสมศรี หอพักร่มเย็น" />
            </div>
            <div class="form-group">
              <label>เบอร์โทรศัพท์ <span class="req">*</span></label>
              <input type="text" [(ngModel)]="formCustomer.phone" name="phone" required placeholder="เช่น 081-234-5678" />
            </div>
            <div class="form-group">
              <label>ที่อยู่ / จุดสังเกต <span class="req">*</span></label>
              <textarea [(ngModel)]="formCustomer.address" name="address" required rows="2" placeholder="เช่น หอพักเอสเพลส ซอยวุ่นวาย ขามเรียง"></textarea>
            </div>
            <div class="coords-row">
              <div class="form-group">
                <label>Latitude (ละติจูด)</label>
                <input type="number" step="any" [(ngModel)]="formCustomer.lat" name="lat" required />
              </div>
              <div class="form-group">
                <label>Longitude (ลองจิจูด)</label>
                <input type="number" step="any" [(ngModel)]="formCustomer.lng" name="lng" required />
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">ยกเลิก</button>
              <button type="submit" class="btn btn-primary">{{ editMode ? 'บันทึกการแก้ไข' : 'บันทึกลูกค้า' }}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .customers-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
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
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .card-header h3 {
      font-size: 16px;
      font-weight: 600;
    }
    .search-box input {
      padding: 6px 12px;
      width: 200px;
      font-size: 13px;
    }
    .table-responsive {
      max-height: 520px;
      overflow-y: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    tr:hover {
      background: #fff7ed;
    }
    tr.selected {
      background: #ffedd5;
    }
    .font-bold {
      font-weight: 600;
      color: #0f172a;
    }
    .phone-link {
      color: #0284c7;
      text-decoration: none;
    }
    .address-cell {
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .coord-btn {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      color: #334155;
    }
    .coord-btn:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .action-buttons {
      display: flex;
      gap: 6px;
    }
    .icon-btn {
      background: none;
      border: 1px solid var(--border);
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    .icon-btn.edit:hover {
      background: #e0f2fe;
      border-color: #7dd3fc;
    }
    .icon-btn.delete:hover {
      background: #fee2e2;
      border-color: #fca5a5;
    }
    .map-preview-card {
      display: flex;
      flex-direction: column;
    }
    .map-view {
      height: 480px;
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      z-index: 0;
    }
    .map-hint {
      margin-top: 10px;
      padding: 8px 12px;
      background: #eff6ff;
      border-radius: 6px;
      font-size: 13px;
      color: #1e40af;
    }
    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }
    .modal-card {
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 460px;
      padding: 24px;
      box-shadow: var(--shadow-lg);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #64748b;
    }
    .form-group {
      margin-bottom: 14px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: #334155;
    }
    .coords-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .req {
      color: #ef4444;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
  `]
})
export class CustomersComponent implements OnInit, AfterViewInit, OnDestroy {
  customers: Customer[] = [];
  searchTerm: string = '';
  selectedCustomer: Customer | null = null;
  
  isModalOpen = false;
  editMode = false;
  formCustomer: Customer = {
    name: '',
    phone: '',
    address: '',
    lat: 16.2465,
    lng: 103.2505
  };

  private map?: L.Map;
  private markersLayer = L.layerGroup();
  private tempMarker?: L.Marker;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadCustomers();
  }

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  get filteredCustomers(): Customer[] {
    if (!this.searchTerm.trim()) return this.customers;
    const term = this.searchTerm.toLowerCase();
    return this.customers.filter(c => 
      c.name.toLowerCase().includes(term) || c.phone.includes(term) || c.address.toLowerCase().includes(term)
    );
  }

  loadCustomers() {
    this.api.getCustomers().subscribe(data => {
      this.customers = data;
      this.renderCustomerMarkers();
    });
  }

  private initMap() {
    this.map = L.map('customer-map').setView([16.2465, 103.2505], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);

    // Shop Marker
    const shopIcon = L.divIcon({
      html: '🏠',
      className: 'custom-shop-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    L.marker([16.2465, 103.2505], { icon: shopIcon })
      .addTo(this.map)
      .bindPopup('<b>ร้านข้าวกล่องเดลิเวอรี่</b><br>จุดเริ่มต้นส่ง 11:30 น.');

    // Map click listener for adding/updating coordinates
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.isModalOpen) {
        this.formCustomer.lat = Number(e.latlng.lat.toFixed(6));
        this.formCustomer.lng = Number(e.latlng.lng.toFixed(6));
        this.updateTempMarker(e.latlng.lat, e.latlng.lng);
      }
    });

    this.renderCustomerMarkers();
  }

  private renderCustomerMarkers() {
    if (!this.map) return;
    this.markersLayer.clearLayers();

    this.customers.forEach(c => {
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 8,
        fillColor: '#f97316',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      });

      marker.bindPopup(`
        <b>${c.name}</b><br>
        📞 ${c.phone}<br>
        📍 ${c.address}
      `);

      marker.on('click', () => {
        this.selectedCustomer = c;
      });

      this.markersLayer.addLayer(marker);
    });
  }

  focusOnMap(c: Customer) {
    this.selectedCustomer = c;
    if (this.map) {
      this.map.flyTo([c.lat, c.lng], 16, { duration: 1 });
    }
  }

  openAddModal() {
    this.editMode = false;
    this.formCustomer = {
      name: '',
      phone: '',
      address: '',
      lat: 16.2465,
      lng: 103.2505
    };
    this.isModalOpen = true;
    this.updateTempMarker(this.formCustomer.lat, this.formCustomer.lng);
  }

  editCustomer(c: Customer) {
    this.editMode = true;
    this.formCustomer = { ...c };
    this.isModalOpen = true;
    this.updateTempMarker(c.lat, c.lng);
  }

  private updateTempMarker(lat: number, lng: number) {
    if (!this.map) return;
    if (this.tempMarker) {
      this.tempMarker.setLatLng([lat, lng]);
    } else {
      this.tempMarker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
      this.tempMarker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        this.formCustomer.lat = Number(pos.lat.toFixed(6));
        this.formCustomer.lng = Number(pos.lng.toFixed(6));
      });
    }
  }

  closeModal() {
    this.isModalOpen = false;
    if (this.tempMarker && this.map) {
      this.map.removeLayer(this.tempMarker);
      this.tempMarker = undefined;
    }
  }

  saveCustomer() {
    if (this.editMode && this.formCustomer.id) {
      this.api.updateCustomer(this.formCustomer.id, this.formCustomer).subscribe(() => {
        this.closeModal();
        this.loadCustomers();
      });
    } else {
      this.api.createCustomer(this.formCustomer).subscribe(() => {
        this.closeModal();
        this.loadCustomers();
      });
    }
  }

  deleteCustomer(c: Customer) {
    if (c.id && confirm(`ต้องการลบลูกค้า "${c.name}" หรือไม่?`)) {
      this.api.deleteCustomer(c.id).subscribe(() => {
        this.loadCustomers();
      });
    }
  }
}
