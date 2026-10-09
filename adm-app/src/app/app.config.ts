import { ApplicationConfig, APP_INITIALIZER, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';

/**
 * Configuración raíz de la aplicación.
 * El frontend ya NO depende del backend Express: toda la capa de datos se
 * resuelve mediante `ServiciosExternosService` (Supabase o mock en memoria).
 *
 * `APP_INITIALIZER` restaura la sesión de Supabase Auth (`getSession`, token
 * persistido en localStorage) ANTES de que la aplicación arranque, de modo
 * que el primer chequeo de `authGuard` en `/cotizaciones` y `/admin` evalúe
 * el estado real del usuario incluso tras recargar la página.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.restaurarSesion(),
      deps: [AuthService],
      multi: true
    }
  ]
};