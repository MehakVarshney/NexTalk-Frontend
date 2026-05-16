import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from './api.config';
import { NotificationResponse, PageResponse } from './models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<PageResponse<NotificationResponse>> {
    return this.http.get<PageResponse<NotificationResponse>>(`${API_BASE_URL}/api/notifications?page=0&size=20`);
  }

  unreadCount(): Observable<{ unreadCount: number }> {
    return this.http.get<{ unreadCount: number }>(`${API_BASE_URL}/api/notifications/unread-count`);
  }

  markAllRead(): Observable<void> {
    return this.http.patch<void>(`${API_BASE_URL}/api/notifications/read-all`, {});
  }
}
