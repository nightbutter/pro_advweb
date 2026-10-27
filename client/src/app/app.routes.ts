import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { RoutesView } from './pages/routes-view/routes-view';
import { Orders } from './pages/orders/orders';
import { Customers } from './pages/customers/customers';
import { RiderPortal } from './pages/rider-portal/rider-portal';
import { CustomerRegister } from './pages/customer-register/customer-register';
import { CustomerAccount } from './pages/customer-account/customer-account';
import { roleGuard, loginPageGuard } from './services/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login, canActivate: [loginPageGuard], title: 'เข้าสู่ระบบ' },
  { path: 'register', component: CustomerRegister, title: 'สมัครสมาชิก' },
  { path: 'account', component: CustomerAccount, canActivate: [roleGuard('customer')], title: 'บัญชีลูกค้า' },
  // เจ้าของร้าน (admin)
  { path: 'routes', component: RoutesView, canActivate: [roleGuard('admin')], title: 'จัดเส้นทางและแบ่งงานไรเดอร์' },
  { path: 'orders', component: Orders, canActivate: [roleGuard('admin')], title: 'จัดการออเดอร์มื้อเที่ยง' },
  { path: 'customers', component: Customers, canActivate: [roleGuard('admin')], title: 'จัดการข้อมูลลูกค้า' },
  // ไรเดอร์
  { path: 'rider', component: RiderPortal, canActivate: [roleGuard('admin', 'rider')], title: 'หน้าจอสำหรับไรเดอร์' },
  { path: '**', redirectTo: 'login' },
];
