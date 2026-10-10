import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type RolUsuario = 'admin' | 'proveedor';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);

  private readonly usuarioSubject = new BehaviorSubject<User | null>(null);
  readonly usuario$: Observable<User | null> = this.usuarioSubject.asObservable();

  private get cliente() {
    return this.supabaseService.getClient();
  }

  get usuarioActual(): User | null {
    return this.usuarioSubject.getValue();
  }

  get tieneSesion(): boolean {
    return this.usuarioActual !== null;
  }

  get rolUsuario(): RolUsuario {
    return this.tieneSesion ? 'admin' : 'proveedor';
  }

  async restaurarSesion(): Promise<void> {
    const cliente = this.cliente;
    if (cliente) {
      try {
        const { data } = await cliente.auth.getSession();
        if (data.session?.user) {
          this.usuarioSubject.next(data.session.user);
          return;
        }
      } catch (err) {
        console.warn('[AuthService] No se pudo restaurar la sesión.', err);
      }
    }
    this.usuarioSubject.next(null);
  }

  async iniciarSesion(email: string, password: string): Promise<User> {
    if (!this.cliente) {
      throw new Error('Sin conexión a Supabase. Configura el archivo .env.');
    }

    const correo = email.trim().toLowerCase();
    const { data, error } = await this.cliente.auth.signInWithPassword({
      email: correo,
      password
    });

    if (error) {
      throw new Error(this.mensajeErrorSupabase(error));
    }

    if (!data.user) {
      throw new Error('No se pudo autenticar el usuario.');
    }

    this.usuarioSubject.next(data.user);
    return data.user;
  }

  async cerrarSesion(): Promise<void> {
    const cliente = this.cliente;
    if (cliente) {
      try {
        await cliente.auth.signOut();
      } catch (err) {
        console.warn('[AuthService] Error al cerrar sesión.', err);
      }
    }
    this.usuarioSubject.next(null);
  }

  private mensajeErrorSupabase(error: { message?: string }): string {
    const mensaje = (error.message ?? '').toLowerCase();
    if (mensaje.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos. Verifica tus credenciales.';
    }
    if (mensaje.includes('email not confirmed')) {
      return 'El correo aún no ha sido confirmado en Supabase.';
    }
    if (mensaje.includes('rate limit') || mensaje.includes('too many requests')) {
      return 'Demasiados intentos fallidos. Espera unos momentos e inténtalo de nuevo.';
    }
    return error.message || 'No se pudo iniciar sesión. Verifica tus datos.';
  }
}