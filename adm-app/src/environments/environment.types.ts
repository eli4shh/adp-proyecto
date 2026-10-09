/**
 * Tipos compartidos de los entornos.
 *
 * ⚠️ IMPORTANTE: este archivo NO debe participar en los `fileReplacements` de
 * `angular.json`. Angular reemplaza `environment.ts` por
 * `environment.development.ts` en la configuración `development`; si la
 * interfaz viviera en `environment.ts`, al reemplazarla el import
 * `./environment` dejaría de exportarla (error TS2724 en `ng serve`).
 * Por eso la interfaz se define aquí, en un módulo estable.
 */
export interface Environment {
  production: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  /** Fuerza el modo mock/offline: responde al instante sin peticiones HTTP a Supabase. */
  forzarMock?: boolean;
}