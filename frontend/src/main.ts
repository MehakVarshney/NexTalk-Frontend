import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { GoogleLoginProvider, SocialAuthServiceConfig, SOCIAL_AUTH_CONFIG } from '@abacritt/angularx-social-login';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth.interceptor';

(globalThis as { global?: typeof globalThis }).global = globalThis;

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: SOCIAL_AUTH_CONFIG,
      useValue: {
        autoLogin: false,
        providers: [
          {
            id: GoogleLoginProvider.PROVIDER_ID,
            provider: new GoogleLoginProvider(
              '432972535296-u6m3g6v8tf2tmnjfn9qle2etfthtbiht.apps.googleusercontent.com',
              {
                oneTapEnabled: false,

                prompt: 'select_account'
              }
            )
          }
        ],
        onError: (err) => {
          console.error('Google Auth Error:', err);
        }
      } as SocialAuthServiceConfig,
    }
  ]
}).catch((error) => console.error(error));
