import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SocialAuthService } from '@abacritt/angularx-social-login';

import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';
import { API_BASE_URL } from './api.config';
import { AuthResponse, UserResponse } from './models';

const mockUser: UserResponse = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@test.com',
  avatarUrl: null,
  provider: 'LOCAL',
  status: 'ONLINE',
  createdAt: new Date().toISOString(),
};

const mockAuthResponse: AuthResponse = {
  accessToken: 'jwt-token-abc',
  tokenType: 'Bearer',
  user: mockUser,
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let storageSpy: jest.SpyInstance;

  const mockSocialAuthService = {
    signOut: jest.fn().mockResolvedValue(undefined),
    authState: { subscribe: jest.fn() },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        TokenStorageService,
        { provide: SocialAuthService, useValue: mockSocialAuthService },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);

    const storage = TestBed.inject(TokenStorageService);
    storageSpy = jest.spyOn(storage, 'save');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('login() should POST credentials and save token', () => {
    service.login('test@test.com', 'password123').subscribe((res) => {
      expect(res.accessToken).toBe('jwt-token-abc');
      expect(res.user.email).toBe('test@test.com');
    });

    const req = httpMock.expectOne(`${API_BASE_URL}/api/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'test@test.com', password: 'password123' });
    req.flush(mockAuthResponse);

    expect(storageSpy).toHaveBeenCalledWith('jwt-token-abc', mockUser);
  });

  it('register() should POST user data and save token', () => {
    service.register('Test User', 'test@test.com', 'password123').subscribe((res) => {
      expect(res.tokenType).toBe('Bearer');
    });

    const req = httpMock.expectOne(`${API_BASE_URL}/api/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Test User',
      email: 'test@test.com',
      password: 'password123',
    });
    req.flush(mockAuthResponse);

    expect(storageSpy).toHaveBeenCalledWith('jwt-token-abc', mockUser);
  });

  it('googleLogin() should POST idToken and save token', () => {
    service.googleLogin('google-id-token').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/api/auth/google`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ idToken: 'google-id-token' });
    req.flush(mockAuthResponse);
  });

  it('logout() should clear storage and call socialAuthService.signOut', async () => {
    const storage = TestBed.inject(TokenStorageService);
    const clearSpy = jest.spyOn(storage, 'clear');

    await service.logout();

    expect(clearSpy).toHaveBeenCalled();
    expect(mockSocialAuthService.signOut).toHaveBeenCalled();
  });

  it('searchUsers() should GET with query param', () => {
    service.searchUsers('john').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/users/search'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('query')).toBe('john');
    req.flush([mockUser]);
  });
});
