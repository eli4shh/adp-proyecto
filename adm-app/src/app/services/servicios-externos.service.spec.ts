import { TestBed } from '@angular/core/testing';
import { ServiciosExternosService } from './servicios-externos.service';
import { SupabaseService } from '../core/services/supabase.service';
import { SolicitudCotizacion } from '../interfaces/servicios-externos';

describe('ServiciosExternosService — crearSolicitud (modo mock)', () => {
  let service: ServiciosExternosService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ServiciosExternosService,
        {
          provide: SupabaseService,
          useFactory: () =>
            ({
              usarMock: true,
              getClient: () => null
            }) as unknown as SupabaseService
        }
      ]
    });
    service = TestBed.inject(ServiciosExternosService);
  });

  it('publica una licitación en abierta y la emite en el catálogo reactivo', () => {
    const catalogo: SolicitudCotizacion[] = [];
    service.solicitudesAbiertas().subscribe({
      next: (sols) => {
        catalogo.length = 0;
        catalogo.push(...sols);
      }
    });

    let creada: SolicitudCotizacion | undefined;
    service
      .crearSolicitud({
        titulo: 'Servicio de mantenimiento de grupos electrógenos',
        categoria_id: 'c0000000-0000-4000-8000-000000000001',
        descripcion: 'Mantenimiento preventivo y correctivo de plantas eléctricas del resort.',
        presupuesto_referencial: 42000,
        fecha_limite: '2026-12-15'
      })
      .subscribe((s) => (creada = s));

    expect(creada).toBeDefined();
    expect(creada!.estado).toBe('abierta');
    expect(creada!.titulo).toBe('Servicio de mantenimiento de grupos electrógenos');
    expect(creada!.presupuesto_referencial).toBe(42000);
    expect(creada!.fecha_limite).toBe('2026-12-15');
    // UUID v4 válido: solo dígitos hexadecimales.
    expect(creada!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(catalogo.some((s) => s.id === creada!.id)).toBe(true);
  });

  it('listarSolicitudes({ estado: "abierta" }) incluye la licitación recién publicada', () => {
    service
      .crearSolicitud({
        titulo: 'Seguridad perimetral nocturna',
        categoria_id: 'c0000000-0000-4000-8000-000000000002',
        descripcion: 'Vigilancia del perímetro del resort por 6 meses.',
        presupuesto_referencial: 90000,
        fecha_limite: '2027-01-31'
      })
      .subscribe(() => undefined);

    let abiertas: SolicitudCotizacion[] = [];
    service.listarSolicitudes({ estado: 'abierta' }).subscribe((sols) => (abiertas = sols));

    expect(abiertas.some((s) => s.titulo === 'Seguridad perimetral nocturna')).toBe(true);
    expect(abiertas.every((s) => s.estado === 'abierta')).toBe(true);
  });
});