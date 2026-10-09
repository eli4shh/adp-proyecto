import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor() {
    this.client = this.initClient();
  }

  private initClient(): SupabaseClient | null {
    if (environment.forzarMock) {
      console.warn('[SupabaseService] forzarMock=true: modo mock forzado, sin peticiones HTTP.');
      return null;
    }
    if (!environment.supabaseUrl || !environment.supabaseKey) return null;
    try {
      return createClient(environment.supabaseUrl, environment.supabaseKey);
    } catch (err) {
      console.warn(
        '[SupabaseService] No se pudo inicializar el cliente Supabase, usando modo mock.',
        err
      );
      return null;
    }
  }

  /** `true` cuando no hay cliente disponible (modo offline/mock o error al inicializar). */
  get usarMock(): boolean {
    return this.client === null;
  }

  /** Devuelve el cliente Supabase, o `null` en modo mock. */
  getClient(): SupabaseClient | null {
    return this.client;
  }
}