import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { Api } from '../../config/api';
import { APP_ICONS } from '../../shared/icons';

@Component({
  selector: 'app-customer-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './customer-register.html',
  styleUrl: './customer-register.css',
})
export class CustomerRegister {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiEndpoint = inject(Api).API_ENDPOINT;
  readonly icons = APP_ICONS;

  name = '';
  phone = '';
  address = '';
  username = '';
  password = '';
  confirmPassword = '';
  loading = false;
  errorMessage = '';

  async submit() {
    this.errorMessage = '';
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
      return;
    }

    this.loading = true;
    try {
      await lastValueFrom(
        this.http.post(`${this.apiEndpoint}/auth/register/customer`, {
          name: this.name.trim(),
          phone: this.phone.trim(),
          address: this.address.trim(),
          username: this.username.trim().toLowerCase(),
          password: this.password,
        }),
      );
      await this.router.navigate(['/login']);
    } catch (err) {
      this.errorMessage =
        (err instanceof HttpErrorResponse && err.error?.error) || 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่';
    } finally {
      this.loading = false;
    }
  }
}
