import { EvaluacionService } from './evaluacion.service';
import { Proveedor, PropuestaCotizacion } from '../interfaces/servicios-externos';

describe('EvaluacionService', () => {
  let service: EvaluacionService;

  beforeEach(() => {
    service = new EvaluacionService();
  });

  function proveedor(id: string, anios: number, calif: number): Proveedor {
    return {
      id,
      ruc: `20${id}`,
      razon_social: `Proveedor ${id}`,
      nombre_contacto: 'Contacto',
      telefono: '+51 999 000 000',
      email: `${id}@correo.pe`,
      anios_experiencia: anios,
      calificacion_historica: calif,
      created_at: '2026-01-01T00:00:00Z'
    };
  }

  function propuesta(
    id: string,
    monto: number,
    dias: number,
    anios: number,
    calif: number
  ): PropuestaCotizacion {
    return {
      id,
      solicitud_id: 's1',
      proveedor_id: `p-${id}`,
      monto_cotizado: monto,
      tiempo_entrega_dias: dias,
      propuesta_tecnica: 'Propuesta de prueba',
      archivo_url: null,
      estado: 'recibida',
      created_at: '2026-01-01T00:00:00Z',
      proveedor: proveedor(id, anios, calif)
    };
  }

  it('ordena de mayor a menor, marca Top 3 y asigna posiciones', () => {
    const props = [
      propuesta('A', 48000, 12, 10, 4.8),
      propuesta('B', 39500, 18, 6, 4.1),
      propuesta('C', 35000, 25, 3, 3.7),
      propuesta('D', 50000, 30, 2, 3.0)
    ];

    const resultado = service.evaluarPropuestas(props);

    expect(resultado).toHaveLength(4);
    for (let i = 1; i < resultado.length; i++) {
      expect(resultado[i - 1].puntajeFinal).toBeGreaterThanOrEqual(resultado[i].puntajeFinal);
    }
    expect(resultado[0].posicion).toBe(1);
    expect(resultado[3].posicion).toBe(4);
    expect(resultado.filter((r) => r.esTop3)).toHaveLength(3);
  });

  it('normaliza todos los criterios y el puntaje final a la escala 0–100', () => {
    const props = [
      propuesta('A', 48000, 12, 10, 4.8),
      propuesta('B', 39500, 18, 6, 4.1),
      propuesta('C', 35000, 25, 3, 3.7)
    ];

    const resultado = service.evaluarPropuestas(props);

    resultado.forEach((r) => {
      Object.values(r.puntajes).forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      });
      expect(r.puntajeFinal).toBeGreaterThanOrEqual(0);
      expect(r.puntajeFinal).toBeLessThanOrEqual(100);
    });

    // Menor costo ⇒ 100 en la normalización de costo
    expect(resultado.find((r) => r.propuesta.id === 'C')?.puntajes.costo).toBe(100);
  });

  it('con una sola propuesta marca Top 1 y criterio histórico escalado a 0–100', () => {
    const resultado = service.evaluarPropuestas([propuesta('U', 10000, 5, 4, 4.0)]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].esTop3).toBe(true);
    expect(resultado[0].posicion).toBe(1);
    expect(resultado[0].puntajes.costo).toBe(100);
    expect(resultado[0].puntajes.historico).toBe(80); // 4.0 / 5 * 100
  });

  it('genera una recomendación que menciona al ganador y la ponderación', () => {
    const props = [
      propuesta('A', 48000, 12, 10, 4.8),
      propuesta('B', 39500, 18, 6, 4.1),
      propuesta('C', 35000, 25, 3, 3.7)
    ];
    const resultado = service.evaluarPropuestas(props);
    const texto = service.generarRecomendacion(resultado[0], props.length);

    expect(texto).toContain('Proveedor A');
    expect(texto).toContain('Costo 35%');
    expect(texto).toContain('100');
  });

  it('prepara registros listos para persistir en evaluaciones_criterios', () => {
    const props = [
      propuesta('A', 48000, 12, 10, 4.8),
      propuesta('B', 39500, 18, 6, 4.1)
    ];
    const resultado = service.evaluarPropuestas(props);
    const registros = service.prepararRegistros(resultado);

    expect(registros).toHaveLength(2);
    expect(registros[0]).toMatchObject({
      propuesta_id: resultado[0].propuesta.id,
      es_top3: true
    });
    expect(registros[0].puntaje_final).toBeCloseTo(resultado[0].puntajeFinal, 2);
    expect(typeof registros[0].fecha_evaluacion).toBe('string');
  });
});