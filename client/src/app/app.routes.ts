import { Routes } from '@angular/router';
import { RoutesViewComponent } from './pages/routes-view/routes-view.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { CustomersComponent } from './pages/customers/customers.component';
import { RiderPortalComponent } from './pages/rider-portal/rider-portal.component';

export const routes: Routes = [
  { path: '', redirectTo: 'routes', pathMatch: 'full' },
  { path: 'routes', component: RoutesViewComponent, title: 'จัดเส้นทางและแบ่งงานไรเดอร์' },
  { path: 'orders', component: OrdersComponent, title: 'จัดการออเดอร์มื้อเที่ยง' },
  { path: 'customers', component: CustomersComponent, title: 'จัดการข้อมูลลูกค้า' },
  { path: 'rider', component: RiderPortalComponent, title: 'หน้าจอสำหรับไรเดอร์' },
  { path: '**', redirectTo: 'routes' }
];
