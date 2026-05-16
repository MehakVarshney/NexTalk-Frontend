import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { SocialAuthService } from '@abacritt/angularx-social-login';

import { API_BASE_URL } from './api.config';
import { AuthResponse, UserResponse, UserStatus } from './models';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private readonly http: HttpClient,
    private readonly storage: TokenStorageService,
    private readonly socialAuthService: SocialAuthService
  ) {}

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE_URL}/api/auth/register`, { name, email, password })
      .pipe(tap((response) => this.storage.save(response.accessToken, response.user)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE_URL}/api/auth/login`, { email, password })
      .pipe(tap((response) => this.storage.save(response.accessToken, response.user)));
  }

  googleLogin(idToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE_URL}/api/auth/google`, { idToken })
      .pipe(tap((response) => this.storage.save(response.accessToken, response.user)));
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/api/auth/forgot-password`, { email });
  }

  verifyOtp(email: string, otp: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/api/auth/verify-otp`, { email, otp });
  }

  resetPassword(email: string, otp: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/api/auth/reset-password`, { email, otp, newPassword });
  }

  me(): Observable<UserResponse> {
    return this.http.get<UserResponse>(`${API_BASE_URL}/api/users/me`);
  }

  searchUsers(query: string): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(`${API_BASE_URL}/api/users/search`, {
      params: { query }
    });
  }

  directory(ids: string[]): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(`${API_BASE_URL}/api/users/directory`, {
      params: { ids }
    });
  }

  updateStatus(status: UserStatus): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${API_BASE_URL}/api/users/me/status`, { status })
      .pipe(tap((user) => this.storage.save(this.storage.token() ?? '', user)));
  }

  updateAvatar(avatarUrl: string): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${API_BASE_URL}/api/users/me/avatar`, { avatarUrl })
      .pipe(tap((user) => this.storage.save(this.storage.token() ?? '', user)));
  }

  async logout(): Promise<void> {
    this.storage.clear();
    sessionStorage.setItem('just_logged_out', 'true');
    try {
      await this.socialAuthService.signOut();
    } catch (e) {
      console.warn('Google sign out failed or not initialized', e);
    }
  }
}
