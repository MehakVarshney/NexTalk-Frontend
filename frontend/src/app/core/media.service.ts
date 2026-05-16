import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from './api.config';
import { MediaResponse, PageResponse } from './models';

@Injectable({ providedIn: 'root' })
export class MediaService {
  constructor(private readonly http: HttpClient) {}

  gallery(): Observable<PageResponse<MediaResponse>> {
    return this.http.get<PageResponse<MediaResponse>>(`${API_BASE_URL}/api/media/gallery?page=0&size=12`);
  }

  upload(file: File): Observable<MediaResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<MediaResponse>(`${API_BASE_URL}/api/media/upload`, formData);
  }
}
