import { Injectable } from '@angular/core';
import { PropuestaCotizacion } from '../interfaces/servicios-externos';

/**
 * Algoritmo de evaluación multicriterio ponderado.
 *
 * Criterios por defecto:
 *  - Costo                  35%  (menor es mejor)
 *  - Experiencia            25%  (mayor es mejor — años del proveedor)
 *  - Disponibilidad/Tiempo  20%  (menor es mejor — días de entrega)
 *  - Evaluación histórica   20%  (mayor es mejor — rating 0 a 5 del proveedor)
 *
 * Todos los criterios se normalizan a escala 0 – 100:
 *  - Costo y Tiempo: min-max invertido (menor valor ⇒ 100).
 *  - Experiencia: min-max directo (mayor valor ⇒ 100).
 *  - Histórico: conversión absoluta de su escala 1–5 (calificación / 5 × 100).
 */

export interface PesosEvaluacion {
  costo: number;          /* 0 – 1 */
  experiencia: number;    /* 0 – 1 */
  disponibilidad: number; /* 0 – 1 */
  historico: number;      /* 0 – 1 */
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

const LABEL_CRITERION: Record<keyof PuntajesCriterios, string> = {
  costo: 'Costo',
  experiencia: 'Experiencia',
  disponibilidad: 'Disponibilidad/Tiempo',
  historico: 'Evaluación histórica'
};

@Injectable({ providedIn: 'root' })
export class EvaluacionService {
  /**
   * Evalúa un conjunto de propuestas (deben incluir el join `proveedor`).
   * Devuelve el ranking ordenado descendentemente por puntaje final.
   */
  evaluarPropuestas(
    propuestas: PropuestaCotizacion[],
    pesos: PesosEvaluacion = PESOS_POR_DEFECTO
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