import { Injectable, Optional } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { PropuestaCotizacion } from '../interfaces/servicios-externos';
import { SupabaseService } from '../core/services/supabase.service';

/**
 * Algoritmo de evaluación multicriterio ponderado (AHP).
 *
 * Criterios evaluados:
 *  - Costo                  (menor es mejor)
 *  - Experiencia            (mayor es mejor — años del proveedor)
 *  - Disponibilidad/Tiempo  (menor es mejor — días de entrega)
 *  - Evaluación histórica   (mayor es mejor — rating 0 a 5 del proveedor)
 *
 * Todos los criterios se normalizan a escala 0 – 100.
 */

export interface PesosEvaluacion {
  costo: number;          /* 0 – 1 */
  experiencia: number;    /* 0 – 1 */
  disponibilidad: number; /* 0 – 1 */
  historico: number;      /* 0 – 1 */
}

export interface ConfiguracionCategoria {
  id: string;
  nombre: string;
  icono: string;
  descripcion: string;
  pesos: PesosEvaluacion;
}

export interface PuntajesCriterios {
  costo: number;
  experiencia: number;
  disponibilidad: number;
  historico: number;
}

export interface PropuestaEvaluada {
  propuesta: PropuestaCotizacion;
  puntajes: PuntajesCriterios;
  /** Nota final ponderada (0 – 100). */
  puntajeFinal: number;
  /** Posición en el ranking (1 = mejor). */
  posicion: number;
  esTop3: boolean;
  /** Criterios en los que la propuesta lidera (para la justificación). */
  criteriosDominantes: string[];
}

/** Filas listas para persistir en `evaluaciones_criterios`. */
export interface RegistroEvaluacion {
  propuesta_id: string;
  puntaje_costo: number;
  puntaje_experiencia: number;
  puntaje_disponibilidad: number;
  puntaje_historico: number;
  puntaje_final: number;
  es_top3: boolean;
  fecha_evaluacion: string;
}

export const PESOS_POR_DEFECTO: PesosEvaluacion = {
  costo: 0.35,
  experiencia: 0.25,
  disponibilidad: 0.2,
  historico: 0.2
};

export const CONFIGURACIONES_CATEGORIA_DEFECTO: Record<string, ConfiguracionCategoria> = {
  'c0000000-0000-4000-8000-000000000004': {
    id: 'c0000000-0000-4000-8000-000000000004',
    nombre: 'Alimentos y Bebidas',
    icono: 'utensils',
    descripcion: 'Catering, carnes, mariscos, licores, insumos frescos y control estricto de cadena de frío.',
    pesos: { costo: 0.25, experiencia: 0.20, disponibilidad: 0.30, historico: 0.25 }
  },
  'c0000000-0000-4000-8000-000000000003': {
    id: 'c0000000-0000-4000-8000-000000000003',
    nombre: 'Housekeeping y Limpieza',
    icono: 'sparkles',
    descripcion: 'Químicos, detergentes, blancos (sábanas/toallas), amenidades y reposición rápida de stock.',
    pesos: { costo: 0.45, experiencia: 0.15, disponibilidad: 0.25, historico: 0.15 }
  },
  'c0000000-0000-4000-8000-000000000001': {
    id: 'c0000000-0000-4000-8000-000000000001',
    nombre: 'Mantenimiento e Ingeniería',
    icono: 'wrench',
    descripcion: 'Aires acondicionados, bombas de piscina, grupos electrógenos, ascensores y repuestos técnicos.',
    pesos: { costo: 0.20, experiencia: 0.40, disponibilidad: 0.25, historico: 0.15 }
  },
  'c0000000-0000-4000-8000-000000000005': {
    id: 'c0000000-0000-4000-8000-000000000005',
    nombre: 'Tecnología y Sistemas',
    icono: 'laptop',
    descripcion: 'Software hotelero (PMS), infraestructura Wi-Fi, cerraduras electrónicas y CCTV perimetral.',
    pesos: { costo: 0.20, experiencia: 0.45, disponibilidad: 0.15, historico: 0.20 }
  },
  'c0000000-0000-4000-8000-000000000002': {
    id: 'c0000000-0000-4000-8000-000000000002',
    nombre: 'Servicios Subcontratados',
    icono: 'handshake',
    descripcion: 'Seguridad privada, vigilancia, jardinería exterior, transporte VIP y outsourcing calificado.',
    pesos: { costo: 0.25, experiencia: 0.35, disponibilidad: 0.15, historico: 0.25 }
  }
};

const LABEL_CRITERION: Record<keyof PuntajesCriterios, string> = {
  costo: 'Costo',
  experiencia: 'Experiencia',
  disponibilidad: 'Disponibilidad/Tiempo',
  historico: 'Evaluación histórica'
};

const STORAGE_PESOS_CATEGORIAS_KEY = 'gm_pesos_categorias_v2';

@Injectable({ providedIn: 'root' })
export class EvaluacionService {
  private pesosActuales: PesosEvaluacion = { ...PESOS_POR_DEFECTO };
  private pesosCategorias: Record<string, PesosEvaluacion> = {};

  private readonly cambioPesosSubject = new Subject<void>();
  readonly cambioPesos$: Observable<void> = this.cambioPesosSubject.asObservable();

  constructor(@Optional() private supabaseService?: SupabaseService) {
    this.cargarPesosDeStorage();
    this.cargarPesosDeSupabase();
  }

  private cargarPesosDeStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(STORAGE_PESOS_CATEGORIAS_KEY);
        if (raw) {
          this.pesosCategorias = JSON.parse(raw);
        }
      }
    } catch {
      this.pesosCategorias = {};
    }
  }

  private async cargarPesosDeSupabase() {
    try {
      const client = this.supabaseService?.getClient();
      if (!client) return;
      const { data } = await client.from('categorias_servicio').select('id, pesos_ahp');
      if (data && Array.isArray(data)) {
        let huboCambios = false;
        data.forEach((row: { id: string; pesos_ahp: PesosEvaluacion | null }) => {
          if (row.pesos_ahp && typeof row.pesos_ahp === 'object') {
            this.pesosCategorias[row.id] = row.pesos_ahp;
            huboCambios = true;
          }
        });
        if (huboCambios) {
          this.guardarPesosEnStorage();
          this.cambioPesosSubject.next();
        }
      }
    } catch {}
  }

  private guardarPesosEnStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_PESOS_CATEGORIAS_KEY, JSON.stringify(this.pesosCategorias));
      }
    } catch {}
  }

  getListaCategoriasConfigurables(): ConfiguracionCategoria[] {
    return Object.values(CONFIGURACIONES_CATEGORIA_DEFECTO).map((cfg) => {
      const personalizados = this.pesosCategorias[cfg.id];
      return {
        ...cfg,
        pesos: personalizados ? { ...personalizados } : { ...cfg.pesos }
      };
    });
  }

  getPesosDeCategoria(categoriaIdOrNombre?: string | null): PesosEvaluacion {
    if (!categoriaIdOrNombre) return this.getPesos();

    // 1. Coincidencia exacta por ID
    if (this.pesosCategorias[categoriaIdOrNombre]) {
      return { ...this.pesosCategorias[categoriaIdOrNombre] };
    }
    const def = CONFIGURACIONES_CATEGORIA_DEFECTO[categoriaIdOrNombre];
    if (def) {
      return { ...def.pesos };
    }

    // 2. Coincidencia por nombre o palabras clave
    const lower = categoriaIdOrNombre.toLowerCase();
    for (const [id, config] of Object.entries(CONFIGURACIONES_CATEGORIA_DEFECTO)) {
      if (config.nombre.toLowerCase().includes(lower) || lower.includes(config.nombre.toLowerCase())) {
        return { ...(this.pesosCategorias[id] || config.pesos) };
      }
    }

    // Mapeo semántico de palabras clave hotel / resort
    if (lower.includes('cater') || lower.includes('alimento') || lower.includes('bebida') || lower.includes('evento') || lower.includes('a&b') || lower.includes('cocina')) {
      return { ...(this.pesosCategorias['c0000000-0000-4000-8000-000000000004'] || CONFIGURACIONES_CATEGORIA_DEFECTO['c0000000-0000-4000-8000-000000000004'].pesos) };
    }
    if (lower.includes('housekeeping') || lower.includes('limpieza') || lower.includes('blanco') || lower.includes('lavanderia') || lower.includes('amenidad') || lower.includes('detergente')) {
      return { ...(this.pesosCategorias['c0000000-0000-4000-8000-000000000003'] || CONFIGURACIONES_CATEGORIA_DEFECTO['c0000000-0000-4000-8000-000000000003'].pesos) };
    }
    if (lower.includes('mantenimiento') || lower.includes('ingenier') || lower.includes('piscina') || lower.includes('clima') || lower.includes('hvac') || lower.includes('bomba') || lower.includes('ascensor')) {
      return { ...(this.pesosCategorias['c0000000-0000-4000-8000-000000000001'] || CONFIGURACIONES_CATEGORIA_DEFECTO['c0000000-0000-4000-8000-000000000001'].pesos) };
    }
    if (lower.includes('tecnolog') || lower.includes('sistema') || lower.includes('software') || lower.includes('pms') || lower.includes('wifi') || lower.includes('red') || lower.includes('cctv')) {
      return { ...(this.pesosCategorias['c0000000-0000-4000-8000-000000000005'] || CONFIGURACIONES_CATEGORIA_DEFECTO['c0000000-0000-4000-8000-000000000005'].pesos) };
    }
    if (lower.includes('subcontrat') || lower.includes('seguridad') || lower.includes('vigilancia') || lower.includes('jardin') || lower.includes('portero') || lower.includes('outsourcing') || lower.includes('transporte')) {
      return { ...(this.pesosCategorias['c0000000-0000-4000-8000-000000000002'] || CONFIGURACIONES_CATEGORIA_DEFECTO['c0000000-0000-4000-8000-000000000002'].pesos) };
    }

    return this.getPesos();
  }

  setPesosDeCategoria(categoriaId: string, nuevosPesos: PesosEvaluacion): void {
    this.pesosCategorias[categoriaId] = { ...nuevosPesos };
    this.guardarPesosEnStorage();
    this.cambioPesosSubject.next();

    // Sincronización en la nube (Supabase)
    try {
      const client = this.supabaseService?.getClient();
      if (client) {
        client.from('categorias_servicio').update({ pesos_ahp: nuevosPesos }).eq('id', categoriaId).then();
      }
    } catch {}
  }

  restablecerPesosCategoria(categoriaId: string): PesosEvaluacion {
    delete this.pesosCategorias[categoriaId];
    this.guardarPesosEnStorage();
    this.cambioPesosSubject.next();

    // Sincronización en la nube (Supabase)
    try {
      const client = this.supabaseService?.getClient();
      if (client) {
        client.from('categorias_servicio').update({ pesos_ahp: null }).eq('id', categoriaId).then();
      }
    } catch {}

    const def = CONFIGURACIONES_CATEGORIA_DEFECTO[categoriaId];
    return def ? { ...def.pesos } : { ...PESOS_POR_DEFECTO };
  }

  getPesos(): PesosEvaluacion {
    return { ...this.pesosActuales };
  }

  setPesos(nuevosPesos: PesosEvaluacion): void {
    this.pesosActuales = { ...nuevosPesos };
    this.cambioPesosSubject.next();
  }

  restablecerPesos(): void {
    this.pesosActuales = { ...PESOS_POR_DEFECTO };
    this.cambioPesosSubject.next();
  }

  /**
   * Evalúa un conjunto de propuestas (deben incluir el join `proveedor`).
   * Devuelve el ranking ordenado descendentemente por puntaje final.
   */
  evaluarPropuestas(
    propuestas: PropuestaCotizacion[],
    pesos: PesosEvaluacion = this.pesosActuales
  ): PropuestaEvaluada[] {
    if (!propuestas.length) return [];

    const sumaPesos = pesos.costo + pesos.experiencia + pesos.disponibilidad + pesos.historico;
    if (sumaPesos <= 0) {
      throw new Error('La suma de los pesos de evaluación debe ser mayor que 0.');
    }

    const valoresCosto = propuestas.map((p) => Number(p.monto_cotizado) || 0);
    const valoresExp = propuestas.map((p) => p.proveedor?.anios_experiencia ?? 0);
    const valoresTiempo = propuestas.map((p) => Number(p.tiempo_entrega_dias) || 0);
    const valoresHist = propuestas.map((p) => p.proveedor?.calificacion_historica ?? 0);

    const minCosto = Math.min(...valoresCosto);
    const maxCosto = Math.max(...valoresCosto);
    const minExp = Math.min(...valoresExp);
    const maxExp = Math.max(...valoresExp);
    const minTiempo = Math.min(...valoresTiempo);
    const maxTiempo = Math.max(...valoresTiempo);

    const evaluadas = propuestas.map((propuesta) => {
      const puntajes: PuntajesCriterios = {
        costo: this.menorEsMejor(Number(propuesta.monto_cotizado) || 0, minCosto, maxCosto),
        experiencia: this.mayorEsMejor(propuesta.proveedor?.anios_experiencia ?? 0, minExp, maxExp),
        disponibilidad: this.menorEsMejor(
          Number(propuesta.tiempo_entrega_dias) || 0,
          minTiempo,
          maxTiempo
        ),
        historico: this.escalaHistorica(propuesta.proveedor?.calificacion_historica ?? 0)
      };

      const puntajeFinal = this.redondear(
        puntajes.costo * pesos.costo +
          puntajes.experiencia * pesos.experiencia +
          puntajes.disponibilidad * pesos.disponibilidad +
          puntajes.historico * pesos.historico
      );

      return { propuesta, puntajes, puntajeFinal };
    });

    // Ranking: puntaje final desc; empate resuelto a favor del menor costo.
    evaluadas.sort((a, b) => {
      if (b.puntajeFinal !== a.puntajeFinal) return b.puntajeFinal - a.puntajeFinal;
      return (Number(a.propuesta.monto_cotizado) || 0) - (Number(b.propuesta.monto_cotizado) || 0);
    });

    const maxPorCriterio = {
      costo: Math.max(...evaluadas.map((e) => e.puntajes.costo)),
      experiencia: Math.max(...evaluadas.map((e) => e.puntajes.experiencia)),
      disponibilidad: Math.max(...evaluadas.map((e) => e.puntajes.disponibilidad)),
      historico: Math.max(...evaluadas.map((e) => e.puntajes.historico))
    };

    return evaluadas.map((evaluada, indice) => {
      const posicion = indice + 1;
      const dominantes = (Object.keys(LABEL_CRITERION) as (keyof PuntajesCriterios)[]).filter(
        (clave) => Math.abs(evaluada.puntajes[clave] - maxPorCriterio[clave]) < 0.0001
      );
      return {
        propuesta: evaluada.propuesta,
        puntajes: evaluada.puntajes,
        puntajeFinal: evaluada.puntajeFinal,
        posicion,
        esTop3: posicion <= 3,
        criteriosDominantes: dominantes.map((clave) => LABEL_CRITERION[clave])
      };
    });
  }

  /** Convierte un ranking en los registros de la tabla `evaluaciones_criterios`. */
  prepararRegistros(evaluadas: PropuestaEvaluada[], fecha?: string): RegistroEvaluacion[] {
    const momento = fecha ?? new Date().toISOString();
    return evaluadas.map((e) => ({
      propuesta_id: e.propuesta.id,
      puntaje_costo: e.puntajes.costo,
      puntaje_experiencia: e.puntajes.experiencia,
      puntaje_disponibilidad: e.puntajes.disponibilidad,
      puntaje_historico: e.puntajes.historico,
      puntaje_final: e.puntajeFinal,
      es_top3: e.esTop3,
      fecha_evaluacion: momento
    }));
  }

  /** Genera el texto técnico de recomendación justificando la opción ganadora. */
  generarRecomendacion(mejor: PropuestaEvaluada, totalPropuestas: number): string {
    const proveedor = mejor.propuesta.proveedor;
    const nombre = proveedor?.razon_social ?? 'El proveedor';
    const monto = this.formatearMoneda(mejor.propuesta.monto_cotizado);
    const dominantes = mejor.criteriosDominantes.length
      ? `Se destaca claramente en: ${mejor.criteriosDominantes.join(', ')}. `
      : '';
    return (
      `La propuesta de ${nombre} (S/ ${monto} · entrega en ${mejor.propuesta.tiempo_entrega_dias} días) ` +
      `obtuvo el mayor puntaje ponderado (${mejor.puntajeFinal.toFixed(2)}/100) entre ${totalPropuestas} oferta(s) evaluada(s). ` +
      dominantes +
      `Ponderación aplicada: Costo 35%, Experiencia 25%, Disponibilidad/Tiempo 20% y Evaluación histórica 20%.`
    );
  }

  /** Menor valor ⇒ 100 (costo y tiempo de entrega). */
  private menorEsMejor(valor: number, minimo: number, maximo: number): number {
    if (maximo === minimo) return 100;
    return this.acotar(((maximo - valor) / (maximo - minimo)) * 100);
  }

  /** Mayor valor ⇒ 100 (experiencia en años). */
  private mayorEsMejor(valor: number, minimo: number, maximo: number): number {
    if (maximo === minimo) return 100;
    return this.acotar(((valor - minimo) / (maximo - minimo)) * 100);
  }

  /** Escala 1–5 ⇒ 0–100 (calificación_historica). */
  private escalaHistorica(calificacion: number): number {
    return this.acotar((calificacion / 5) * 100);
  }

  private acotar(valor: number): number {
    return Math.max(0, Math.min(100, valor));
  }

  private redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
  }

  private formatearMoneda(valor: number): string {
    return (Number(valor) || 0).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}