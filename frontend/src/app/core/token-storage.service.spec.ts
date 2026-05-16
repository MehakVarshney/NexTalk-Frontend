import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';
import { UserResponse } from './models';

const mockUser: UserResponse = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@test.com',
  avatarUrl: null,
  provider: 'LOCAL',
  status: 'ONLINE',
  createdAt: new Date().toISOString(),
};

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenStorageService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should save token and user to localStorage', () => {
    service.save('mock-token', mockUser);

    expect(localStorage.getItem('nextalk_token')).toBe('mock-token');
    expect(JSON.parse(localStorage.getItem('nextalk_user')!)).toEqual(mockUser);
  });

  it('should update signals after save', () => {
    service.save('mock-token', mockUser);

    expect(service.token()).toBe('mock-token');
    expect(service.user()).toEqual(mockUser);
  });

  it('should clear token and user from localStorage', () => {
    service.save('mock-token', mockUser);
    service.clear();

    expect(localStorage.getItem('nextalk_token')).toBeNull();
    expect(localStorage.getItem('nextalk_user')).toBeNull();
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('should updateUser partially without full re-login', () => {
    service.save('mock-token', mockUser);
    service.updateUser({ name: 'Updated Name' });

    expect(service.user()?.name).toBe('Updated Name');
    expect(service.user()?.email).toBe('test@test.com'); // unchanged
  });

  it('should not crash on updateUser when no user is stored', () => {
    expect(() => service.updateUser({ name: 'Someone' })).not.toThrow();
  });

  it('should return null token when nothing stored', () => {
    expect(service.token()).toBeNull();
  });
});
