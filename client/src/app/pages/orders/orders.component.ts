import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Customer, Order } from '../../models/types';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="orders-container">
      <div class="header-section">
        <div>
          <h2>📦 จัดการออเดอร์มื้อเที่ยง (Order Management)</h2>
          <p class="subtitle">ระบบรับออเดอร์ 10:00 - 11:30 น. (แต่ละออเดอร์สั่งไม่เกิน 3 กล่อง)</p>
        </div>
        <div class="action-buttons-top">
          <button class="btn btn-secondary" (click)="simulateOrders(28)">
            🎲 จำลองออเดอร์มื้อเที่ยง (28 รายการ)
          </button>
          <button class="btn btn-primary" (click)="openAddModal()">
            + สร้างออเดอร์ใหม่
          </button>
        </div>
      </div>

      <!-- Quick Metrics Cards -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-icon">📋</div>
          <div>
            <div class="metric-value">{{ orders.length }}</div>
            <div class="metric-label">จำนวนออเดอร์วันนี้</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-icon">🍱</div>
          <div>
            <div class="metric-value">{{ totalBoxes }}</div>
            <div class="metric-label">จำนวนข้าวกล่องทั้งหมด</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-icon">💰</div>
          <div>
            <div class="metric-value">{{ totalRevenue | number:'1.0-0' }} ฿</div>
            <div class="metric-label">ยอดขายรวม (65฿/กล่อง)</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-icon">🥩</div>
          <div>
            <div class="metric-value">{{ totalFoodCost | number:'1.0-0' }} ฿</div>
            <div class="metric-label">ต้นทุนอาหาร (40฿/กล่อง)</div>
          </div>
        </div>
      </div>

      <!-- Order List Table -->
      <div class="card">
        <div class="card-header">
          <h3>รายการสั่งซื้อวันนี้</h3>
          <div class="header-tools">
            <span class="badge badge-info">{{ orders.length }} รายการ</span>
            <button class="btn btn-danger btn-sm" *ngIf="orders.length > 0" (click)="clearAllOrders()">
              🗑️ ล้างออเดอร์ทั้งหมด
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>เลขที่ออเดอร์</th>
                <th>เวลาที่สั่ง</th>
                <th>ลูกค้า</th>
                <th>เบอร์โทร</th>
                <th>สถานที่จัดส่ง</th>
                <th>จำนวนกล่อง</th>
                <th>ยอดเงิน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ord of orders">
                <td class="font-bold">{{ ord.orderNumber }}</td>
                <td class="text-muted">{{ ord.orderTime || '10:30' }}</td>
                <td>{{ ord.customerName }}</td>
                <td>{{ ord.customerPhone }}</td>
                <td class="address-cell">{{ ord.customerAddress }}</td>
                <td>
                  <span class="badge" [ngClass]="getBoxBadgeClass(ord.boxCount)">
                    🍱 {{ ord.boxCount }} กล่อง
                  </span>
                </td>
                <td class="font-bold text-primary">{{ ord.boxCount * 65 }} ฿</td>
                <td>
                  <span class="badge" [class.badge-success]="ord.status === 'assigned'" [class.badge-warning]="ord.status === 'pending'">
                    {{ ord.status === 'assigned' ? 'จัดไรเดอร์แล้ว' : 'รอจัดส่ง' }}
                  </span>
                </td>
                <td>
                  <div class="row-actions">
                    <button class="icon-btn edit" (click)="openEditModal(ord)">✏️</button>
                    <button class="icon-btn delete" (click)="deleteOrder(ord)">🗑️</button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="orders.length === 0">
                <td colspan="9" class="empty-state">
                  ยังไม่มีออเดอร์สำหรับมื้อเที่ยงนี้ กดปุ่ม <strong>"จำลองออเดอร์มื้อเที่ยง"</strong> ด้านบนเพื่อทดสอบ
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add / Edit Modal -->
      <div class="modal-backdrop" *ngIf="isModalOpen">
        <div class="modal-card">
          <div class="modal-header">
            <h3>{{ editMode ? '✏️ แก้ไขออเดอร์' : '➕ สร้างออเดอร์ใหม่' }}</h3>
            <button class="close-btn" (click)="closeModal()">✕</button>
          </div>
          <form (ngSubmit)="saveOrder()">
            <div class="form-group" *ngIf="!editMode">
              <label>เลือกลูกค้า <span class="req">*</span></label>
              <select [(ngModel)]="selectedCustomerId" name="customerId" required>
                <option [ngValue]="null" disabled>-- เลือกลูกค้า --</option>
                <option *ngFor="let c of customers" [ngValue]="c.id">
                  {{ c.name }} ({{ c.address }})
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>จำนวนข้าวกล่อง (เงื่อนไขร้าน: ไม่เกิน 3 กล่อง) <span class="req">*</span></label>
              <select [(ngModel)]="formBoxCount" name="boxCount" required>
                <option [ngValue]="1">🍱 1 กล่อง (65 บาท)</option>
                <option [ngValue]="2">🍱 2 กล่อง (130 บาท)</option>
                <option [ngValue]="3">🍱 3 กล่อง (195 บาท)</option>
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">ยกเลิก</button>
              <button type="submit" class="btn btn-primary">บันทึกออเดอร์</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .orders-container {
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
    .action-buttons-top {
      display: flex;
      gap: 10px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .metric-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: var(--shadow-sm);
    }
    .metric-icon {
      font-size: 28px;
    }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-main);
    }
    .metric-label {
      font-size: 13px;
      color: var(--text-muted);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .header-tools {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
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
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid var(--border);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    tr:hover {
      background: #f8fafc;
    }
    .font-bold {
      font-weight: 600;
    }
    .text-primary {
      color: var(--primary);
    }
    .text-muted {
      color: var(--text-muted);
    }
    .address-cell {
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row-actions {
      display: flex;
      gap: 6px;
    }
    .icon-btn {
      background: none;
      border: 1px solid var(--border);
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 15px;
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
    }
    .modal-card {
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 440px;
      padding: 24px;
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
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .req {
      color: #ef4444;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }
  `]
})
export class OrdersComponent implements OnInit {
  orders: Order[] = [];
  customers: Customer[] = [];

  isModalOpen = false;
  editMode = false;
  editingOrderId?: number;
  selectedCustomerId: number | null = null;
  formBoxCount: number = 1;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadOrders();
    this.loadCustomers();
  }

  get totalBoxes(): number {
    return this.orders.reduce((sum, o) => sum + o.boxCount, 0);
  }

  get totalRevenue(): number {
    return this.totalBoxes * 65;
  }

  get totalFoodCost(): number {
    return this.totalBoxes * 40;
  }

  loadOrders() {
    this.api.getOrders().subscribe(data => {
      this.orders = data;
    });
  }

  loadCustomers() {
    this.api.getCustomers().subscribe(data => {
      this.customers = data;
    });
  }

  getBoxBadgeClass(boxes: number): string {
    if (boxes === 1) return 'badge-info';
    if (boxes === 2) return 'badge-warning';
    return 'badge-danger';
  }

  openAddModal() {
    this.editMode = false;
    this.selectedCustomerId = this.customers.length > 0 ? this.customers[0].id! : null;
    this.formBoxCount = 1;
    this.isModalOpen = true;
  }

  openEditModal(order: Order) {
    this.editMode = true;
    this.editingOrderId = order.id;
    this.selectedCustomerId = order.customerId;
    this.formBoxCount = order.boxCount;
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.editingOrderId = undefined;
  }

  saveOrder() {
    if (this.editMode && this.editingOrderId) {
      this.api.updateOrder(this.editingOrderId, {
        boxCount: this.formBoxCount,
        customerId: this.selectedCustomerId || undefined
      }).subscribe(() => {
        this.closeModal();
        this.loadOrders();
      });
    } else if (this.selectedCustomerId) {
      this.api.createOrder({
        customerId: this.selectedCustomerId,
        boxCount: this.formBoxCount
      }).subscribe(() => {
        this.closeModal();
        this.loadOrders();
      });
    }
  }

  deleteOrder(order: Order) {
    if (order.id && confirm(`ต้องการลบออเดอร์ ${order.orderNumber} หรือไม่?`)) {
      this.api.deleteOrder(order.id).subscribe(() => {
        this.loadOrders();
      });
    }
  }

  simulateOrders(count: number) {
    this.api.simulateOrders(count).subscribe(() => {
      this.loadOrders();
    });
  }

  clearAllOrders() {
    if (confirm('คุณต้องการล้างออเดอร์ทั้งหมดหรือไม่?')) {
      this.api.clearOrders().subscribe(() => {
        this.loadOrders();
      });
    }
  }
}
