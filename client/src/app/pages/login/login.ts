import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { Auth } from '../../services/auth';
import { APP_ICONS } from '../../shared/icons';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private auth = inject(Auth);
  private router = inject(Router);
  readonly icons = APP_ICONS;

  username = '';
  password = '';
  showPassword = false;
  loading = false;
  errorMessage = '';

  async submit() {
    if (!this.username.trim() || !this.password) {
      this.errorMessage = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
      return;
    }
    this.loading = true;
    this.errorMessage = '';

    try {
      await this.auth.login(this.username.trim(), this.password);
      this.router.navigateByUrl(this.auth.homeRoute());
    } catch (err) {
      this.password = '';
      this.errorMessage =
        (err instanceof HttpErrorResponse && err.error?.error) || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';
    } finally {
      this.loading = false;
    }
  }
}
