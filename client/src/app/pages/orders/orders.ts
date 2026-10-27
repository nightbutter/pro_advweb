import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CustomerApi } from '../../services/api/customer-api';
import { OrderApi } from '../../services/api/order-api';
import { Customer } from '../../model/customer';
import { Order } from '../../model/order';
import { APP_ICONS } from '../../shared/icons';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class Orders implements OnInit {
  private orderApi = inject(OrderApi);
  private customerApi = inject(CustomerApi);
  readonly icons = APP_ICONS;

  orders: Order[] = [];
  customers: Customer[] = [];
  loading = true;
  simulating = false;

  isModalOpen = false;
  editMode = false;
  editingOrderId?: number;
  selectedCustomerId: number | null = null;
  formBoxCount: number = 1;
  readonly boxOptions = [1, 2, 3];

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

  async loadOrders() {
    try {
      this.orders = await this.orderApi.getOrders();
    } finally {
      this.loading = false;
    }
  }

  async loadCustomers() {
    this.customers = await this.customerApi.getCustomers();
  }

  getBoxBadgeClass(boxes: number): string {
    if (boxes === 1) return 'badge-info';
    if (boxes === 2) return 'badge-warning';
    return 'badge-brand';
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

  async saveOrder() {
    if (this.editMode && this.editingOrderId) {
      await this.orderApi.updateOrder(this.editingOrderId, {
        boxCount: this.formBoxCount,
        customerId: this.selectedCustomerId || undefined,
      });
    } else if (this.selectedCustomerId) {
      await this.orderApi.createOrder({
        customerId: this.selectedCustomerId,
        boxCount: this.formBoxCount,
      });
    } else {
      return;
    }
    this.closeModal();
    await this.loadOrders();
  }

  async deleteOrder(order: Order) {
    if (order.id && confirm(`ต้องการลบออเดอร์ ${order.orderNumber} หรือไม่?`)) {
      await this.orderApi.deleteOrder(order.id);
      await this.loadOrders();
    }
  }

  async simulateOrders(count?: number) {
    this.simulating = true;
    try {
      await this.orderApi.simulateOrders(count);
      await this.loadOrders();
    } finally {
      this.simulating = false;
    }
  }

  async clearAllOrders() {
    if (confirm('คุณต้องการล้างออเดอร์ทั้งหมดหรือไม่?')) {
      await this.orderApi.clearOrders();
      await this.loadOrders();
    }
  }
}
