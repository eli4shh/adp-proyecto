import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    // Optionally check roles if required by the route data
    const expectedRoles = route.data['roles'] as Array<string>;
    if (expectedRoles) {
      const userRole = authService.getRole();
      if (!userRole || !expectedRoles.includes(userRole)) {
        // Not authorized for this role, redirect or show error
        router.navigate(['/']); // Or a specific unauthorized page
        return false;
      }
    }
    return true;
  }

  // Not logged in so redirect to login page with the return url
  router.navigate(['/login']);
  return false;
};