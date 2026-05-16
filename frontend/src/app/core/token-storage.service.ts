import { Injectable, signal } from '@angular/core';

import { UserResponse } from './models';

const TOKEN_KEY = 'nextalk_token';
const USER_KEY = 'nextalk_user';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<UserResponse | null>(this.readUser());

  save(token: string, user: UserResponse): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.token.set(token);
    this.user.set(user);
  }

  /** Patch specific fields on the stored user without a full re-login */
  updateUser(partial: Partial<UserResponse>): void {
    const current = this.user();
    if (!current) return;
    const updated = { ...current, ...partial };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    this.user.set(updated);
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  private readUser(): UserResponse | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as UserResponse;
    } catch {
      return null;
    }
  }
}
