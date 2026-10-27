import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { Api } from '../config/api';
import { AuthUser, LoginResponse } from '../model/auth-user';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

/** Service แชร์สถานะการล็อกอินให้ทุก component (เก็บใน sessionStorage) */
@Injectable({
  providedIn: 'root',
})
export class Auth {
  http = inject(HttpClient);
  router = inject(Router);
  api = inject(Api);
  apiEndpoint = this.api.API_ENDPOINT;

  private userSignal = signal<AuthUser | null>(this.loadUser());

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.userSignal() !== null);
  readonly isAdmin = computed(() => this.userSignal()?.role === 'admin');

  public async login(username: string, password: string) {
    const url = `${this.apiEndpoint}/auth/login`;
    const res = (await lastValueFrom(this.http.post(url, { username, password }))) as LoginResponse;
    // sessionStorage: token จะหายเมื่อปิดแท็บ
    sessionStorage.setItem(TOKEN_KEY, res.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSignal.set(res.user);
    return res;
  }

  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  // หน้าแรกหลังล็อกอินขึ้นกับ role
  homeRoute(): string {
    const role = this.userSignal()?.role;
    if (role === 'admin') return '/routes';
    if (role === 'customer') return '/account';
    return '/rider';
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
