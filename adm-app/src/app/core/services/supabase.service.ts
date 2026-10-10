import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../../env';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null = null;

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        this.client = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
      } catch (err) {
        console.error('Error al conectar con Supabase:', err);
      }
    } else {
      console.warn('No se encontraron credenciales de Supabase en .env');
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  get tieneConexion(): boolean {
    return this.client !== null;
  }
}