import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Api } from '../../config/api';
import { Rider } from '../../model/rider';

@Injectable({
  providedIn: 'root',
})
export class RiderApi {
  http = inject(HttpClient);
  api = inject(Api);
  apiEndpoint = this.api.API_ENDPOINT;

  public async getRiders() {
    const url = `${this.apiEndpoint}/riders`;
    const response = await lastValueFrom(this.http.get(url));
    return response as Rider[];
  }
}
