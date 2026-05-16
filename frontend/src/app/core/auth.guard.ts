import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { TokenStorageService } from './token-storage.service';

export const authGuard: CanActivateFn = () => {
  const token = inject(TokenStorageService).token();
  const router = inject(Router);
  if (token) {
    return true;
  }
  return router.createUrlTree(['/auth']);
};
