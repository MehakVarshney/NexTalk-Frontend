import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { AuthComponent } from './features/auth/auth.component';
import { ShellComponent } from './features/shell/shell.component';

export const routes: Routes = [
  { path: 'auth', component: AuthComponent },
  { path: 'app', component: ShellComponent, canActivate: [authGuard] },
  { path: 'app/:roomId', component: ShellComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: '**', redirectTo: 'app' }
];
