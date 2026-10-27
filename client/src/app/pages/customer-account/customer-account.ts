import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { Api } from '../../config/api';
import { Auth } from '../../services/auth';
import { APP_ICONS } from '../../shared/icons';

interface CustomerProfile {
  name: string;
  phone: string;
  address: string;
}

@Component({
  selector: 'app-customer-account',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './customer-account.html',
  styleUrl: './customer-account.css',
})
export class CustomerAccount implements OnInit {
  private http = inject(HttpClient);
  private apiEndpoint = inject(Api).API_ENDPOINT;
  private auth = inject(Auth);
  readonly icons = APP_ICONS;

  profile: CustomerProfile | null = null;
  loading = true;
  errorMessage = '';

  async ngOnInit() {
    try {
      const result = await lastValueFrom(
        this.http.get<{ profile: CustomerProfile | null }>(`${this.apiEndpoint}/auth/me`),
      );
      this.profile = result.profile;
      if (!this.profile) this.errorMessage = 'ไม่พบข้อมูลบัญชีลูกค้า';
    } catch (err) {
      this.errorMessage =
        (err instanceof HttpErrorResponse && err.error?.error) || 'โหลดข้อมูลบัญชีไม่สำเร็จ';
    } finally {
      this.loading = false;
    }
  }

  logout() {
    this.auth.logout();
  }
}
