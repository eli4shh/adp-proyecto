import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export const DATOS_DEMO = Object.freeze({
  email: 'admin@compras.pe',
  password: 'admin123',
  nombre: 'Administrador',
  rol: 'admin'
});

export type RolUsuario = 'admin' | 'proveedor';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);

  /** Estado reactivo de la sesión. `null` = sin sesión activa. */
  private readonly usuarioSubject = new BehaviorSubject<User | null>(null);

  /** Stream reactivo del usuario autenticado (emite el valor actual al suscribirse). */
  readonly usuario$: Observable<User | null> = this.usuarioSubject.asObservable();

  private get cliente() {
    return this.supabaseService.getClient();
  }

  /** `true` cuando no hay cliente Supabase (modo offline/mock): el login usa credenciales demo. */
  get usaMock(): boolean {
    return this.supabaseService.usarMock;
  }

  /** Valor síncrono del usuario autenticado (para guards y componentes). */
  get usuarioActual(): User | null {
    return this.usuarioSubject.getValue();
  }

  /** `true` si hay una sesión activa (rol admin/compras). */
  get tieneSesion(): boolean {
    return this.usuarioActual !== null;
  }

  /** Rol derivado del usuario autenticado (basado en el correo corporativo). */
  get rolUsuario(): RolUsuario {
    return this.tieneSesion ? 'admin' : 'proveedor';
  }

  /**
   * Restaura la sesión persistida tras una recarga.
   * Se ejecuta en el `APP_INITIALIZER` de `app.config.ts` para que los guards
   * evalúen la sesión real desde el primer instante.
   */
  async restaurarSesion(): Promise<void> {
    const cliente = this.cliente;
    if (cliente) {
      try {
        const { data } = await cliente.auth.getSession();
        if (data.session?.user) {
          localStorage.removeItem('demo_session');
          this.usuarioSubject.next(data.session.user);
          return;
        }
      } catch (err) {
        console.warn('[AuthService] No se pudo restaurar la sesión de Supabase.', err);
      }
    }

    const demoGuardado = localStorage.getItem('demo_session');
    if (demoGuardado) {
      try {
        const usuario = JSON.parse(demoGuardado);
        this.usuarioSubject.next(usuario);
        return;
      } catch {
        localStorage.removeItem('demo_session');
      }
    }

    this.usuarioSubject.next(null);
  }

  /**
   * Inicia sesión con Supabase Auth (`signInWithPassword`) o credenciales DEMO.
   *
   * Autentica prioritariamente contra Supabase Auth para emitir el token JWT
   * real (rol `authenticated`) que habilita las políticas RLS.
   *
   * @throws Error con un mensaje legible si las credenciales son inválidas.
   */
  async iniciarSesion(email: string, password: string): Promise<User> {
    const correo = email.trim().toLowerCase();

    // 1. Autenticación prioritaria contra Supabase Auth (genera el token JWT real)
    if (this.cliente) {
      try {
        const { data, error } = await this.cliente.auth.signInWithPassword({
          email: correo,
          password
        });
        if (!error && data.user) {
          localStorage.removeItem('demo_session');
          this.usuarioSubject.next(data.user);
          return data.user;
        }
        if (error && (correo !== DATOS_DEMO.email.toLowerCase() || password !== DATOS_DEMO.password)) {
          throw new Error(this.mensajeErrorSupabase(error));
        }
      } catch (err: any) {
        if (correo !== DATOS_DEMO.email.toLowerCase() || password !== DATOS_DEMO.password) {
          throw err;
        }
        console.warn('[AuthService] No se pudo autenticar en Supabase, recurriendo al usuario demo local.', err);
      }
    }

    // 2. Acceso DEMO: respaldo para desarrollo u offline
    if (correo === DATOS_DEMO.email.toLowerCase() && password === DATOS_DEMO.password) {
      const usuarioDemo: User = {
        id: '00000000-0000-4000-8000-000000000000',
        aud: 'authenticated',
        role: DATOS_DEMO.rol,
        email: DATOS_DEMO.email,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { nombre: DATOS_DEMO.nombre, rol: DATOS_DEMO.rol },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString()
      };
      localStorage.setItem('demo_session', JSON.stringify(usuarioDemo));
      this.usuarioSubject.next(usuarioDemo);
      return usuarioDemo;
    }

    throw new Error(
      `Credenciales inválidas. Verifica tus credenciales o usa ${DATOS_DEMO.email} / ${DATOS_DEMO.password}.`
    );
  }

  /**
   * Cierra la sesión (`signOut`): invalida el token en Supabase, limpia el
   * storage local y notifica a todos los suscriptores con `null`.
   */
  async cerrarSesion(): Promise<void> {
    localStorage.removeItem('demo_session');
    const cliente = this.cliente;
    if (cliente) {
      try {
        const { error } = await cliente.auth.signOut();
        if (error) {
          console.warn('[AuthService] SignOut devolvió un error (se limpia la sesión local igualmente).', error);
        }
      } catch (err) {
        console.warn('[AuthService] No se pudo cerrar la sesión remota, se limpia el estado local.', err);
      }
    }
    this.usuarioSubject.next(null);
  }

  /** Traduce los errores estándar de Supabase Auth a mensajes legibles. */
  private mensajeErrorSupabase(error: { message?: string; code?: string }): string {
    const mensaje = (error.message ?? '').toLowerCase();
    if (mensaje.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos. Verifica tus credenciales.';
    }
    if (mensaje.includes('email not confirmed')) {
      return 'Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada.';
    }
    if (mensaje.includes('rate limit') || mensaje.includes('too many requests')) {
      return 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.';
    }
    return error.message || 'No se pudo iniciar sesión. Inténtalo nuevamente.';
  }
}