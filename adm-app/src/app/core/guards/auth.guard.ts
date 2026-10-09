import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard de autenticación (guard funcional de Angular, `CanActivateFn`).
 *
 * Protege las rutas internas del equipo de compras (`/cotizaciones` y
 * `/admin`): si NO hay sesión activa de Supabase Auth, redirige a `/login`
 * conservando la URL original en `?redirectTo=` para volver tras autenticarse.
 *
 * La ruta `/postulacion` queda deliberadamente FUERA de este guard: es la vía
 * pública de postulación de proveedores y no requiere sesión interna.
 */
export const authGuard: CanActivateFn = (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.tieneSesion) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { redirectTo: estado.url }
  });
};