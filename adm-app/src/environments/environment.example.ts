/**
 * PLANTILLA de referencia para los entornos reales (segura para el repo).
 *
 * ⚠️ SEGURIDAD: NUNCA pongas aquí credenciales reales.
 * `environment.ts` y `environment.development.ts` están en `.gitignore`;
 * para configurar una máquina nueva, copia este archivo y completa los
 * valores con la URL y la PUBLISHABLE key de tu proyecto Supabase.
 *
 * Únicamente la Publishable key (`sb_publishable_...`) puede vivir en el
 * frontend. La Secret key (`sb_secret_...`) es exclusiva del backend.
 */
import type { Environment } from './environment.types';

export const environment: Environment = {
  production: false,
  forzarMock: false,
  supabaseUrl: '',
  supabaseKey: ''
};