import { Component, signal, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GoogleSigninButtonModule, SocialAuthService } from '@abacritt/angularx-social-login';

import { AuthService } from '../../core/auth.service';

/** Standard email pattern */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * Password rules:
 *  - At least 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 *  - At least one special character (!@#$%^&* etc.)
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};:'",.<>?\/\\|`~]).{8,}$/;

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, GoogleSigninButtonModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css'
})
export class AuthComponent implements OnInit {
  mode = signal<'login' | 'register' | 'forgot_password' | 'verify_otp' | 'reset_password'>('login');
  name = '';
  email = '';
  password = '';
  otp = '';
  confirmPassword = '';

  /** Separate inline validation hints (register only) */
  emailError  = signal('');
  passwordError = signal('');
  loading = signal(false);
  error = signal('');
  
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  googleButtonWidth = signal(360);

  @HostListener('window:resize')
  onResize() {
    this.calculateGoogleBtnWidth();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update(v => !v);
  }

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly socialAuthService: SocialAuthService
  ) {}

  ngOnInit(): void {
    this.calculateGoogleBtnWidth();

    this.socialAuthService.authState.subscribe((user) => {
      if (user && user.idToken) {
        // If the user just logged out, ignore this stale auto-emission
        if (sessionStorage.getItem('just_logged_out') === 'true') {
          sessionStorage.removeItem('just_logged_out');
          try {
            void this.socialAuthService.signOut();
          } catch (e) {
            // ignore
          }
          return;
        }

        this.loading.set(true);
        this.authService.googleLogin(user.idToken).subscribe({
          next: () => {
            this.loading.set(false);
            void this.router.navigateByUrl('/app');
          },
          error: (err) => {
            this.loading.set(false);
            this.error.set(err?.error?.message ?? 'Google login failed. Check backend services.');
          }
        });
      }
    });
  }

  calculateGoogleBtnWidth() {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (screenWidth <= 480) {
      this.googleButtonWidth.set(screenWidth - 48 - 4); // accounting for padding and borders
    } else {
      this.googleButtonWidth.set(360); // matching the 440px max-width minus 80px padding
    }
  }

  submit(): void {
    this.error.set('');
    this.emailError.set('');
    this.passwordError.set('');

    // ── Client-side validation (register only) ──────────────────────────────
    if (this.mode() === 'register') {
      let hasError = false;

      if (!EMAIL_REGEX.test(this.email)) {
        this.emailError.set('Invalid email address. Use the format: user@example.com');
        hasError = true;
      }

      if (!PASSWORD_REGEX.test(this.password)) {
        this.passwordError.set(
          'Weak password. Must be 8+ characters and include uppercase, lowercase, a number, and a special character.'
        );
        hasError = true;
      }

      if (hasError) return;
    }
    // ────────────────────────────────────────────────────────────────────────

    this.loading.set(true);

    const request = this.mode() === 'login'
      ? this.authService.login(this.email, this.password)
      : this.authService.register(this.name, this.email, this.password);

    request.subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl('/app');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Request failed. Check backend services.');
      }
    });
  }

  submitForgotPassword(): void {
    this.error.set('');
    this.emailError.set('');

    if (!EMAIL_REGEX.test(this.email)) {
      this.emailError.set('Invalid email address.');
      return;
    }

    this.loading.set(true);
    this.authService.requestPasswordReset(this.email).subscribe({
      next: () => {
        this.loading.set(false);
        this.switchMode('verify_otp');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to request OTP. Make sure your email is registered.');
      }
    });
  }

  submitVerifyOtp(): void {
    this.error.set('');
    
    if (!this.otp || this.otp.length !== 6) {
      this.error.set('Please enter a valid 6-digit OTP.');
      return;
    }

    this.loading.set(true);
    this.authService.verifyOtp(this.email, this.otp).subscribe({
      next: () => {
        this.loading.set(false);
        this.switchMode('reset_password');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Invalid or expired OTP.');
      }
    });
  }

  submitResetPassword(): void {
    this.error.set('');
    this.passwordError.set('');

    if (!PASSWORD_REGEX.test(this.password)) {
      this.passwordError.set('Weak password. Must be 8+ characters and include uppercase, lowercase, a number, and a special character.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.authService.resetPassword(this.email, this.otp, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.password = '';
        this.confirmPassword = '';
        this.switchMode('login');
        this.error.set('Password successfully reset! Please login with your new password.');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to reset password.');
      }
    });
  }

  switchMode(mode: 'login' | 'register' | 'forgot_password' | 'verify_otp' | 'reset_password'): void {
    this.mode.set(mode);
    this.error.set('');
    this.emailError.set('');
    this.passwordError.set('');
  }
}

