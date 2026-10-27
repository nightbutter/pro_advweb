import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Role } from '../model/auth-user';

// Guard ฝั่งหน้าเว็บ (backend ตรวจสิทธิ์ซ้ำทุก request)
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    const router = inject(Router);
    const user = auth.user();

    if (!user) {
      return router.createUrlTree(['/login']);
    }
    if (!roles.includes(user.role)) {
      return router.createUrlTree([auth.homeRoute()]);
    }
    return true;
  };
}

// ถ้าล็อกอินแล้ว ไม่ต้องเข้าหน้า login อีก
export const loginPageGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.isLoggedIn() ? inject(Router).createUrlTree([auth.homeRoute()]) : true;
};
