import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Api {
  // ใช้ URL แบบ relative: ตอน ng serve จะ proxy /api ไปที่ backend (ดู proxy.conf.json)
  public readonly API_ENDPOINT: string = '/api';
}
