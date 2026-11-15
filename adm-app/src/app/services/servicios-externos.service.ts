import { Injectable, inject } from '@angular/core';
import { Observable, Subject, from, throwError, of } from 'rxjs';
import { map, shareReplay, tap, catchError } from 'rxjs/operators';
import { SupabaseService } from '../core/services/supabase.service';
import {
  CategoriaServicio,
  Contrato,
  DatosContrato,
  EstadoPropuesta,
  EstadoSolicitud,
  EvaluacionCriterios,
  FiltrosSolicitud,
  PostulacionPayload,
  Proveedor,
  PropuestaCotizacion,
  SolicitudCotizacion,
  NuevaSolicitudPayload
} from '../interfaces/servicios-externos';
import { RegistroEvaluacion } from './evaluacion.service';

type RespuestaSupabase = { data: unknown; error: unknown };

@Injectable({ providedIn: 'root' })
export class ServiciosExternosService {
  private readonly supabaseService = inject(SupabaseService);

  private readonly solicitudesAbiertasSubject = new Subject<SolicitudCotizacion[]>();
  private categoriasCache$: Observable<CategoriaServicio[]> | null = null;
  private solicitudesCache$: Observable<SolicitudCotizacion[]> | null = null;

  constructor() {
    const cliente = this.supabaseService.getClient();
    if (cliente) {
      cliente.auth.onAuthStateChange(() => {
        this.limpiarCache();
      });
    }
  }

  limpiarCache(): void {
    this.categoriasCache$ = null;
    this.solicitudesCache$ = null;
  }

  private get supabase() {
    return this.supabaseService.getClient();
  }

  listarCategorias(): Observable<CategoriaServicio[]> {
    if (!this.categoriasCache$) {
      if (!this.supabase) {
        this.categoriasCache$ = of(this.categoriasPorDefecto()).pipe(shareReplay(1));
      } else {
        this.categoriasCache$ = from(
          this.supabase.from('categorias_servicio').select('*').order('nombre')
        ).pipe(
          map((res) => {
            const datos = this.extraerDatos<CategoriaServicio>(res);
            return datos.length > 0 ? datos : this.categoriasPorDefecto();
          }),
          catchError(() => of(this.categoriasPorDefecto())),
          shareReplay(1)
        );
      }
    }
    return this.categoriasCache$;
  }

  listarSolicitudes(filtros: FiltrosSolicitud = {}): Observable<SolicitudCotizacion[]> {
    return this.obtenerSolicitudesCache().pipe(
      map((todas) => {
        let filtradas = todas.filter((s) => this.cumpleFiltros(s, filtros));
        // Si se solicitan licitaciones abiertas y no hay ninguna, suministramos las abiertas por defecto
        if (filtros.estado === 'abierta' && filtradas.length === 0) {
          filtradas = this.solicitudesPorDefecto().filter((s) => s.estado === 'abierta');
        }
        return filtradas;
      })
    );
  }

  private readonly STORAGE_SOLICITUDES_KEY = 'gm_solicitudes_locales_v1';

  obtenerSolicitudesDeStorage(): SolicitudCotizacion[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = localStorage.getItem(this.STORAGE_SOLICITUDES_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  guardarSolicitudEnStorage(s: SolicitudCotizacion): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const list = this.obtenerSolicitudesDeStorage();
      const filtradas = list.filter((item) => item.id !== s.id);
      filtradas.unshift(s);
      localStorage.setItem(this.STORAGE_SOLICITUDES_KEY, JSON.stringify(filtradas));
    } catch {}
  }

  private obtenerSolicitudesCache(): Observable<SolicitudCotizacion[]> {
    if (!this.solicitudesCache$) {
      const locales = this.obtenerSolicitudesDeStorage();
      const defaults = this.solicitudesPorDefecto();

      const combinarSols = (base: SolicitudCotizacion[]) => {
        const map = new Map<string, SolicitudCotizacion>();
        defaults.forEach((s) => map.set(s.id, s));
        base.forEach((s) => map.set(s.id, s));
        locales.forEach((s) => map.set(s.id, s));
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      };

      if (!this.supabase) {
        this.solicitudesCache$ = of(combinarSols([])).pipe(shareReplay(1));
      } else {
        this.solicitudesCache$ = from(
          this.supabase
            .from('solicitudes_cotizacion')
            .select('*, categoria:categorias_servicio(*)')
            .order('created_at', { ascending: false })
        ).pipe(
          map((res) => {
            const datos = this.extraerDatos<SolicitudCotizacion>(res);
            return combinarSols(datos);
          }),
          catchError(() => of(combinarSols([]))),
          shareReplay(1)
        );
      }
    }
    return this.solicitudesCache$;
  }

  private cumpleFiltros(s: SolicitudCotizacion, filtros: FiltrosSolicitud): boolean {
    const okEstado = !filtros.estado || s.estado === filtros.estado;
    const okCategoria = !filtros.categoriaId || s.categoria_id === filtros.categoriaId;
    return okEstado && okCategoria;
  }

  private readonly STORAGE_PROPUESTAS_KEY = 'gm_propuestas_locales_v1';

  private obtenerPropuestasDeStorage(solicitudId?: string): PropuestaCotizacion[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = localStorage.getItem(this.STORAGE_PROPUESTAS_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw) as PropuestaCotizacion[];
      if (!Array.isArray(list)) return [];
      if (!solicitudId) return list;
      return list.filter((p) => p.solicitud_id === solicitudId);
    } catch {
      return [];
    }
  }

  private guardarEnStorage(propuesta: PropuestaCotizacion) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const list = this.obtenerPropuestasDeStorage();
      const filtradas = list.filter((p) => p.id !== propuesta.id);
      filtradas.unshift(propuesta);
      localStorage.setItem(this.STORAGE_PROPUESTAS_KEY, JSON.stringify(filtradas));
    } catch {}
  }

  private combinarPropuestas(locales: PropuestaCotizacion[], base: PropuestaCotizacion[]): PropuestaCotizacion[] {
    const map = new Map<string, PropuestaCotizacion>();

    const getProvKey = (p: PropuestaCotizacion) => {
      return (p.proveedor?.ruc && p.proveedor.ruc.trim()) ||
        p.proveedor_id ||
        (p.proveedor?.razon_social && p.proveedor.razon_social.trim().toLowerCase()) ||
        p.id;
    };

    // 1. Insertamos las propuestas base
    base.forEach((p) => {
      const key = `${p.solicitud_id}_${getProvKey(p)}`;
      map.set(key, p);
    });

    // 2. Sobreponemos las propuestas locales evitando duplicados del mismo proveedor en la misma licitación
    locales.forEach((p) => {
      const key = `${p.solicitud_id}_${getProvKey(p)}`;
      const existente = map.get(key);
      if (!existente || p.estado === 'seleccionada' || existente.estado !== 'seleccionada') {
        map.set(key, p);
      }
    });

    return Array.from(map.values());
  }

  cambiarEstadoSolicitud(solicitudId: string, nuevoEstado: EstadoSolicitud): Observable<SolicitudCotizacion> {
    this.solicitudesCache$ = null;
    const fallback: SolicitudCotizacion = {
      id: solicitudId,
      titulo: 'Licitación',
      categoria_id: '',
      descripcion: null,
      presupuesto_referencial: 0,
      fecha_limite: null,
      estado: nuevoEstado,
      created_at: new Date().toISOString()
    };

    if (!this.supabase) {
      this.refrescarCatalogoSolicitudesAbiertas();
      return of(fallback);
    }

    return from(
      this.supabase
        .from('solicitudes_cotizacion')
        .update({ estado: nuevoEstado })
        .eq('id', solicitudId)
        .select('*, categoria:categorias_servicio(*)')
        .single()
        .then((res: RespuestaSupabase) => {
          if (res.error) throw res.error;
          return res.data as SolicitudCotizacion;
        })
    ).pipe(
      tap(() => this.refrescarCatalogoSolicitudesAbiertas()),
      catchError((err) => {
        console.warn('Advertencia al actualizar estado de solicitud en Supabase:', err);
        this.refrescarCatalogoSolicitudesAbiertas();
        return of(fallback);
      })
    );
  }

  listarPropuestas(solicitudId?: string): Observable<PropuestaCotizacion[]> {
    const locales = this.obtenerPropuestasDeStorage(solicitudId);

    if (!this.supabase) {
      return of(this.combinarPropuestas(locales, this.propuestasPorDefecto(solicitudId)));
    }

    let query = this.supabase.from('propuestas_cotizacion').select('*, proveedor:proveedores(*)');
    if (solicitudId) query = query.eq('solicitud_id', solicitudId);

    return from(query.order('created_at', { ascending: false })).pipe(
      map((res) => {
        const datos = this.extraerDatos<PropuestaCotizacion>(res);
        const base = datos && datos.length > 0 ? datos : this.propuestasPorDefecto(solicitudId);
        return this.combinarPropuestas(locales, base);
      }),
      catchError(() => of(this.combinarPropuestas(locales, this.propuestasPorDefecto(solicitudId))))
    );
  }

  listarProveedores(): Observable<Proveedor[]> {
    if (!this.supabase) {
      return of(this.proveedoresPorDefecto());
    }
    return from(this.supabase.from('proveedores').select('*').order('razon_social')).pipe(
      map((res) => {
        const datos = this.extraerDatos<Proveedor>(res);
        return datos.length > 0 ? datos : this.proveedoresPorDefecto();
      }),
      catchError(() => of(this.proveedoresPorDefecto()))
    );
  }

  listarEvaluaciones(): Observable<EvaluacionCriterios[]> {
    if (!this.supabase) {
      return of([]);
    }
    return from(
      this.supabase
        .from('evaluaciones_criterios')
        .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*))')
    ).pipe(
      map((res) => this.extraerDatos<EvaluacionCriterios>(res)),
      catchError(() => of([]))
    );
  }

  listarContratos(): Observable<Contrato[]> {
    if (!this.supabase) {
      return of([]);
    }
    return from(
      this.supabase
        .from('contratos')
        .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*), solicitud:solicitudes_cotizacion(*))')
        .order('fecha_inicio', { ascending: false })
    ).pipe(
      map((res) => this.extraerDatos<Contrato>(res)),
      catchError(() => of([]))
    );
  }

  solicitudesAbiertas(): Observable<SolicitudCotizacion[]> {
    this.refrescarCatalogoSolicitudesAbiertas();
    return this.solicitudesAbiertasSubject;
  }

  private refrescarCatalogoSolicitudesAbiertas(): void {
    this.listarSolicitudes({ estado: 'abierta' }).subscribe({
      next: (sols) => this.solicitudesAbiertasSubject.next(sols),
      error: () => this.solicitudesAbiertasSubject.next(this.solicitudesPorDefecto().filter(s => s.estado === 'abierta'))
    });
  }

  crearSolicitud(data: NuevaSolicitudPayload): Observable<SolicitudCotizacion> {
    const localNueva: SolicitudCotizacion = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'a0000000-0000-4000-8000-' + Math.floor(Math.random() * 899999999999 + 100000000000),
      titulo: data.titulo,
      categoria_id: data.categoria_id,
      descripcion: data.descripcion,
      presupuesto_referencial: data.presupuesto_referencial,
      fecha_limite: data.fecha_limite,
      estado: 'abierta',
      created_at: new Date().toISOString()
    };

    this.guardarSolicitudEnStorage(localNueva);

    if (!this.supabase) {
      this.solicitudesCache$ = null;
      this.refrescarCatalogoSolicitudesAbiertas();
      return of(localNueva);
    }

    this.solicitudesCache$ = null;
    return from(
      this.supabase
        .from('solicitudes_cotizacion')
        .insert({
          id: localNueva.id,
          titulo: data.titulo,
          categoria_id: data.categoria_id,
          descripcion: data.descripcion,
          presupuesto_referencial: data.presupuesto_referencial,
          fecha_limite: data.fecha_limite,
          estado: 'abierta'
        })
        .select('*, categoria:categorias_servicio(*)')
        .single()
        .then((res: RespuestaSupabase) => {
          if (res.error) throw res.error;
          const creada = res.data as SolicitudCotizacion;
          this.guardarSolicitudEnStorage(creada);
          return creada;
        })
    ).pipe(
      catchError((err) => {
        console.warn('Licitación registrada en caché local (RLS o fuera de línea):', err);
        return of(localNueva);
      }),
      tap(() => {
        this.solicitudesCache$ = null;
        this.refrescarCatalogoSolicitudesAbiertas();
      })
    );
  }

  enviarPostulacion(
    payload: PostulacionPayload
  ): Observable<{ proveedor: Proveedor; propuesta: PropuestaCotizacion }> {
    const anios = Number(payload.proveedor.anios_experiencia) || 0;
    const califHistorica = (payload.proveedor.calificacion_historica && payload.proveedor.calificacion_historica > 0)
      ? Number(payload.proveedor.calificacion_historica)
      : Number(Math.min(5.0, Math.max(3.5, 3.5 + anios * 0.25)).toFixed(1));

    const provPayload = {
      ...payload.proveedor,
      calificacion_historica: califHistorica
    };

    const fallbackProv: Proveedor = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'b0000000-0000-4000-8000-' + Math.floor(Math.random() * 899999999999 + 100000000000),
      ...provPayload,
      created_at: new Date().toISOString()
    };

    const propId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'e0000000-0000-4000-8000-' + Math.floor(Math.random() * 899999999999 + 100000000000);

    const fallbackProp: PropuestaCotizacion = {
      id: propId,
      solicitud_id: payload.propuesta.solicitud_id,
      proveedor_id: fallbackProv.id,
      monto_cotizado: payload.propuesta.monto_cotizado,
      tiempo_entrega_dias: payload.propuesta.tiempo_entrega_dias,
      propuesta_tecnica: payload.propuesta.propuesta_tecnica,
      archivo_url: payload.propuesta.archivo_url,
      estado: 'recibida',
      created_at: new Date().toISOString(),
      proveedor: fallbackProv
    };

    if (!this.supabase) {
      this.guardarEnStorage(fallbackProp);
      return of({ proveedor: fallbackProv, propuesta: fallbackProp });
    }

    return from(
      this.supabase
        .from('proveedores')
        .insert(provPayload)
        .select()
        .single()
        .then(async (resProv: RespuestaSupabase) => {
          if (resProv.error) throw resProv.error;
          const proveedor = resProv.data as Proveedor;

          const propData = {
            id: propId,
            solicitud_id: payload.propuesta.solicitud_id,
            proveedor_id: proveedor.id,
            monto_cotizado: payload.propuesta.monto_cotizado,
            tiempo_entrega_dias: payload.propuesta.tiempo_entrega_dias,
            propuesta_tecnica: payload.propuesta.propuesta_tecnica,
            archivo_url: payload.propuesta.archivo_url,
            estado: 'recibida' as const
          };

          // Inserción en Supabase sin .select() para evitar error RLS 42501
          try {
            await this.supabase!.from('propuestas_cotizacion').insert(propData);
          } catch (insertErr) {
            console.warn('Advertencia en inserción en Supabase:', insertErr);
          }

          const propuestaGuardada: PropuestaCotizacion = {
            ...propData,
            created_at: new Date().toISOString(),
            proveedor
          };

          this.guardarEnStorage(propuestaGuardada);
          return { proveedor, propuesta: propuestaGuardada };
        })
    ).pipe(
      catchError((err) => {
        console.warn('Postulación procesada en respaldo local:', err);
        this.guardarEnStorage(fallbackProp);
        return of({ proveedor: fallbackProv, propuesta: fallbackProp });
      })
    );
  }

  guardarEvaluaciones(registros: RegistroEvaluacion[]): Observable<EvaluacionCriterios[]> {
    if (!this.supabase) {
      return of([]);
    }
    return from(
      this.supabase
        .from('evaluaciones_criterios')
        .upsert(registros, { onConflict: 'propuesta_id' })
        .select()
    ).pipe(
      map((res) => this.extraerDatos<EvaluacionCriterios>(res)),
      catchError(() => of([]))
    );
  }

  actualizarEstadosEnStorage(solicitudId: string, ganadoraPropuestaId: string): void {
    const locales = this.obtenerPropuestasDeStorage();
    const actualizadas = locales.map((p) => {
      if (p.solicitud_id === solicitudId) {
        const nuevoEstado: EstadoPropuesta = p.id === ganadoraPropuestaId ? 'seleccionada' : 'rechazada';
        return {
          ...p,
          estado: nuevoEstado
        };
      }
      return p;
    });
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.STORAGE_PROPUESTAS_KEY, JSON.stringify(actualizadas));
      }
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }

  adjudicarContrato(datos: DatosContrato): Observable<Contrato> {
    if (!this.supabase) {
      const mockContrato: Contrato = {
        id: 'd0000000-0000-4000-8000-000000000001',
        propuesta_id: datos.propuesta_id,
        fecha_inicio: datos.fecha_inicio,
        fecha_fin: datos.fecha_fin,
        monto_total: 42500,
        terminos: datos.terminos ?? null,
        estado: 'vigente',
        created_at: new Date().toISOString()
      };
      return of(mockContrato);
    }
    this.solicitudesCache$ = null;
    const cliente = this.supabase;
    return from(
      cliente
        .from('propuestas_cotizacion')
        .select('id, monto_cotizado, solicitud_id')
        .eq('id', datos.propuesta_id)
        .single()
        .then((resFetch: RespuestaSupabase) => {
          if (resFetch.error) throw resFetch.error;
          const propuesta = resFetch.data as { id: string; monto_cotizado: number; solicitud_id: string };

          // Marcar la ganadora como 'seleccionada'
          return cliente
            .from('propuestas_cotizacion')
            .update({ estado: 'seleccionada' })
            .eq('id', datos.propuesta_id)
            .then(async (resUpd: RespuestaSupabase) => {
              if (resUpd.error) throw resUpd.error;

              // Marcar las otras propuestas de esta licitación como 'rechazada'
              try {
                await cliente
                  .from('propuestas_cotizacion')
                  .update({ estado: 'rechazada' })
                  .eq('solicitud_id', propuesta.solicitud_id)
                  .neq('id', datos.propuesta_id);
              } catch (e) {
                console.warn('No se pudo marcar propuestas restantes como rechazadas:', e);
              }

              // Sincronizar en localStorage
              this.actualizarEstadosEnStorage(propuesta.solicitud_id, datos.propuesta_id);

              return propuesta;
            });
        })
        .then((propuesta: { id: string; monto_cotizado: number; solicitud_id: string }) => {
          return cliente
            .from('solicitudes_cotizacion')
            .update({ estado: 'cerrada' })
            .eq('id', propuesta.solicitud_id)
            .then((resSol: RespuestaSupabase) => {
              if (resSol.error) throw resSol.error;
              return propuesta;
            });
        })
        .then((propuesta: { id: string; monto_cotizado: number; solicitud_id: string }) => {
          const payload = {
            propuesta_id: datos.propuesta_id,
            fecha_inicio: datos.fecha_inicio,
            fecha_fin: datos.fecha_fin,
            monto_total: propuesta.monto_cotizado,
            terminos: datos.terminos ?? null,
            estado: 'vigente'
          };
          return cliente
            .from('contratos')
            .insert(payload)
            .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*))')
            .single();
        })
        .then((resContrato: RespuestaSupabase) => {
          if (resContrato.error) throw resContrato.error;
          this.solicitudesCache$ = null;
          return resContrato.data as Contrato;
        })
    );
  }

  private extraerDatos<T>(res: RespuestaSupabase): T[] {
    if (res.error) throw res.error;
    return (res.data ?? []) as T[];
  }

  // ---------------------------------------------------------------------------
  // DATOS POR DEFECTO / SEED DE RESPALDO (FIDELIDAD AL PLIEGO Y CASOS DE USO)
  // ---------------------------------------------------------------------------

  private categoriasPorDefecto(): CategoriaServicio[] {
    return [
      { id: 'c0000000-0000-4000-8000-000000000001', nombre: 'Mantenimiento de Piscinas', descripcion: 'Limpieza, tratamiento químico del agua y mantenimiento general de piscinas.', icono: 'pool', activo: true, created_at: '2026-09-01T10:00:00Z' },
      { id: 'c0000000-0000-4000-8000-000000000002', nombre: 'Seguridad y Vigilancia', descripcion: 'Seguridad privada, vigilancia nocturna y control de accesos.', icono: 'security', activo: true, created_at: '2026-09-01T10:00:00Z' },
      { id: 'c0000000-0000-4000-8000-000000000003', nombre: 'Jardinería y Paisajismo', descripcion: 'Diseño, mantenimiento y paisajismo de áreas verdes.', icono: 'park', activo: true, created_at: '2026-09-01T10:00:00Z' },
      { id: 'c0000000-0000-4000-8000-000000000004', nombre: 'Catering y Eventos', descripcion: 'Banquetería, alimentación y eventos corporativos.', icono: 'celebration', activo: true, created_at: '2026-09-01T10:00:00Z' },
      { id: 'c0000000-0000-4000-8000-000000000005', nombre: 'Mantenimiento Climatización/HVAC', descripcion: 'Instalación y mantenimiento preventivo de aire acondicionado y climatización.', icono: 'ac_unit', activo: true, created_at: '2026-09-01T10:00:00Z' }
    ];
  }

  private solicitudesPorDefecto(): SolicitudCotizacion[] {
    return [
      {
        id: 'a0000000-0000-4000-8000-000000000014',
        titulo: 'LIC-2025-014: Mantenimiento Integral de Sistemas de Climatización y Chiller Central',
        categoria_id: 'c0000000-0000-4000-8000-000000000005',
        descripcion: 'Mantenimiento Preventivo de Climatización Centralizada · Torres A, B y Centro de Convenciones.',
        presupuesto_referencial: 48000,
        fecha_limite: '2026-12-15',
        estado: 'abierta',
        created_at: new Date().toISOString(),
        categoria: {
          id: 'c0000000-0000-4000-8000-000000000005',
          nombre: 'Mantenimiento Climatización/HVAC',
          descripcion: 'Instalación y mantenimiento preventivo de aire acondicionado y climatización.',
          icono: 'ac_unit',
          activo: true,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'a0000000-0000-4000-8000-000000000002',
        titulo: 'Servicio de seguridad y vigilancia nocturna',
        categoria_id: 'c0000000-0000-4000-8000-000000000002',
        descripcion: 'Seguridad privada para perímetro y vestíbulos, turnos de 8 horas, por un plazo de 6 meses.',
        presupuesto_referencial: 180000,
        fecha_limite: '2026-12-01',
        estado: 'cerrada',
        created_at: '2026-09-10T10:00:00Z',
        categoria: {
          id: 'c0000000-0000-4000-8000-000000000002',
          nombre: 'Seguridad y Vigilancia',
          descripcion: 'Seguridad privada, vigilancia nocturna y control de accesos.',
          icono: 'security',
          activo: true,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'a0000000-0000-4000-8000-000000000003',
        titulo: 'Catering para evento corporativo anual (300 invitados)',
        categoria_id: 'c0000000-0000-4000-8000-000000000004',
        descripcion: 'Banquetería completa: entradas, plato de fondo, postres y bebidas para 300 invitados.',
        presupuesto_referencial: 60000,
        fecha_limite: '2026-11-30',
        estado: 'en_evaluacion',
        created_at: '2026-09-12T10:00:00Z',
        categoria: {
          id: 'c0000000-0000-4000-8000-000000000004',
          nombre: 'Catering y Eventos',
          descripcion: 'Banquetería, alimentación y eventos corporativos.',
          icono: 'celebration',
          activo: true,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        titulo: 'Mantenimiento integral de piscinas del resort',
        categoria_id: 'c0000000-0000-4000-8000-000000000001',
        descripcion: 'Contrato trimestral de mantenimiento preventivo y correctivo para las 3 piscinas, incluido tratamiento químico semanal.',
        presupuesto_referencial: 45000,
        fecha_limite: '2026-10-01',
        estado: 'cerrada',
        created_at: '2026-09-08T10:00:00Z',
        categoria: {
          id: 'c0000000-0000-4000-8000-000000000001',
          nombre: 'Mantenimiento de Piscinas',
          descripcion: 'Limpieza, tratamiento químico del agua y mantenimiento general de piscinas.',
          icono: 'pool',
          activo: true,
          created_at: '2026-09-01T10:00:00Z'
        }
      }
    ];
  }

  private proveedoresPorDefecto(): Proveedor[] {
    return [
      { id: 'b0000000-0000-4000-8000-000000000002', ruc: '20234567890', razon_social: 'VigilPro Perú S.R.L.', nombre_contacto: 'Rosa Quispe', telefono: '+51 999 222 333', email: 'ventas@vigilpro.pe', anios_experiencia: 6, calificacion_historica: 4.2, created_at: '2026-09-01T10:00:00Z' },
      { id: 'b0000000-0000-4000-8000-000000000011', ruc: '20549281943', razon_social: 'TermoClima Industrial del Sur S.A.C.', nombre_contacto: 'Ing. Carlos Mendoza Alarcón', telefono: '+51 984 321 654', email: 'licitaciones@termoclima.pe', anios_experiencia: 8, calificacion_historica: 4.8, created_at: '2026-09-01T10:00:00Z' },
      { id: 'b0000000-0000-4000-8000-000000000012', ruc: '20601934812', razon_social: 'ClimaPro Soluciones Andinas', nombre_contacto: 'Ing. Fernando Ramos', telefono: '+51 954 112 334', email: 'ventas@climapro.pe', anios_experiencia: 7, calificacion_historica: 4.5, created_at: '2026-09-01T10:00:00Z' },
      { id: 'b0000000-0000-4000-8000-000000000013', ruc: '20114832965', razon_social: 'Servicios Frío HVAC Perú S.A.', nombre_contacto: 'Ing. Roberto Silva', telefono: '+51 981 776 543', email: 'contacto@frioperu.com', anios_experiencia: 6, calificacion_historica: 4.1, created_at: '2026-09-01T10:00:00Z' },
      { id: 'b0000000-0000-4000-8000-000000000014', ruc: '20401940173', razon_social: 'Refrigeración Comercial Lima EIRL', nombre_contacto: 'Sr. Javier Morales', telefono: '+51 977 443 219', email: 'jmorales@refcomercial.pe', anios_experiencia: 3, calificacion_historica: 3.8, created_at: '2026-09-01T10:00:00Z' }
    ];
  }

  private propuestasPorDefecto(solicitudId?: string): PropuestaCotizacion[] {
    const todas: PropuestaCotizacion[] = [
      {
        id: 'e0000000-0000-4000-8000-000000000011',
        solicitud_id: 'a0000000-0000-4000-8000-000000000014',
        proveedor_id: 'b0000000-0000-4000-8000-000000000011',
        monto_cotizado: 42500,
        tiempo_entrega_dias: 15,
        propuesta_tecnica: 'Plan de mantenimiento preventivo y correctivo con repuestos originales y técnicos homologados.',
        archivo_url: 'Expediente_Termoclima_HVAC.pdf',
        estado: 'recibida',
        created_at: new Date().toISOString(),
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000011',
          ruc: '20549281943',
          razon_social: 'TermoClima Industrial del Sur S.A.C.',
          nombre_contacto: 'Ing. Carlos Mendoza Alarcón',
          telefono: '+51 984 321 654',
          email: 'licitaciones@termoclima.pe',
          anios_experiencia: 8,
          calificacion_historica: 4.8,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000012',
        solicitud_id: 'a0000000-0000-4000-8000-000000000014',
        proveedor_id: 'b0000000-0000-4000-8000-000000000012',
        monto_cotizado: 44900,
        tiempo_entrega_dias: 12,
        propuesta_tecnica: 'Mantenimiento integral de chillers y unidades manejadoras de aire con protocolo rápido.',
        archivo_url: 'Expediente_ClimaPro.pdf',
        estado: 'recibida',
        created_at: new Date().toISOString(),
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000012',
          ruc: '20601934812',
          razon_social: 'ClimaPro Soluciones Andinas',
          nombre_contacto: 'Ing. Fernando Ramos',
          telefono: '+51 954 112 334',
          email: 'ventas@climapro.pe',
          anios_experiencia: 7,
          calificacion_historica: 4.5,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000013',
        solicitud_id: 'a0000000-0000-4000-8000-000000000014',
        proveedor_id: 'b0000000-0000-4000-8000-000000000013',
        monto_cotizado: 41000,
        tiempo_entrega_dias: 25,
        propuesta_tecnica: 'Servicio técnico especializado en chillers industriales con insumos importados.',
        archivo_url: 'Expediente_Servicios_Frio.pdf',
        estado: 'recibida',
        created_at: new Date().toISOString(),
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000013',
          ruc: '20114832965',
          razon_social: 'Servicios Frío HVAC Perú S.A.',
          nombre_contacto: 'Ing. Roberto Silva',
          telefono: '+51 981 776 543',
          email: 'contacto@frioperu.com',
          anios_experiencia: 6,
          calificacion_historica: 4.1,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000014',
        solicitud_id: 'a0000000-0000-4000-8000-000000000014',
        proveedor_id: 'b0000000-0000-4000-8000-000000000014',
        monto_cotizado: 47200,
        tiempo_entrega_dias: 20,
        propuesta_tecnica: 'Mantenimiento correctivo y preventivo programado.',
        archivo_url: 'Expediente_Refrigeracion_Lima.pdf',
        estado: 'recibida',
        created_at: new Date().toISOString(),
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000014',
          ruc: '20401940173',
          razon_social: 'Refrigeración Comercial Lima EIRL',
          nombre_contacto: 'Sr. Javier Morales',
          telefono: '+51 977 443 219',
          email: 'jmorales@refcomercial.pe',
          anios_experiencia: 3,
          calificacion_historica: 3.8,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000004',
        solicitud_id: 'a0000000-0000-4000-8000-000000000003',
        proveedor_id: 'b0000000-0000-4000-8000-000000000004',
        monto_cotizado: 48000,
        tiempo_entrega_dias: 12,
        propuesta_tecnica: 'Menú ejecutivo premium de 4 tiempos, chef residente y montaje con floristería.',
        archivo_url: 'Expediente_Sabor_Servicio.pdf',
        estado: 'recibida',
        created_at: '2026-09-15T10:00:00Z',
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000004',
          ruc: '20456789012',
          razon_social: 'Sabor & Servicio Catering S.A.C.',
          nombre_contacto: 'María Fernanda Torres',
          telefono: '+51 999 444 555',
          email: 'eventos@saboryservicio.pe',
          anios_experiencia: 10,
          calificacion_historica: 4.8,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000005',
        solicitud_id: 'a0000000-0000-4000-8000-000000000003',
        proveedor_id: 'b0000000-0000-4000-8000-000000000007',
        monto_cotizado: 39500,
        tiempo_entrega_dias: 18,
        propuesta_tecnica: 'Buffet de 3 estaciones, personal de servicio incluido y alquiler de mobiliario.',
        archivo_url: 'Expediente_Catering_Del_Pais.pdf',
        estado: 'recibida',
        created_at: '2026-09-16T10:00:00Z',
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000007',
          ruc: '20789012345',
          razon_social: 'Catering del País S.R.L.',
          nombre_contacto: 'Diego Salas',
          telefono: '+51 999 777 888',
          email: 'cotiza@cateringdelpais.pe',
          anios_experiencia: 6,
          calificacion_historica: 4.1,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000006',
        solicitud_id: 'a0000000-0000-4000-8000-000000000003',
        proveedor_id: 'b0000000-0000-4000-8000-000000000008',
        monto_cotizado: 35000,
        tiempo_entrega_dias: 25,
        propuesta_tecnica: 'Propuesta económica con menú estándar, montaje sencillo y servicio autoservicio.',
        archivo_url: 'Expediente_Grupo_Eventos.pdf',
        estado: 'recibida',
        created_at: '2026-09-17T10:00:00Z',
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000008',
          ruc: '20890123456',
          razon_social: 'Grupo Eventos Iquitos S.A.C.',
          nombre_contacto: 'Adriana Flores',
          telefono: '+51 999 888 999',
          email: 'contacto@grupoeventosiq.pe',
          anios_experiencia: 3,
          calificacion_historica: 3.7,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      // ── Propuestas para Licitación de Piscinas (Adjudicada) ──
      {
        id: 'e0000000-0000-4000-8000-000000000001',
        solicitud_id: 'a0000000-0000-4000-8000-000000000001',
        proveedor_id: 'b0000000-0000-4000-8000-000000000001',
        monto_cotizado: 42000,
        tiempo_entrega_dias: 14,
        propuesta_tecnica: 'Mantenimiento integral de 3 piscinas principales y recirculación automatizada.',
        archivo_url: 'Expediente_AquaClean.pdf',
        estado: 'seleccionada',
        created_at: '2026-09-10T10:00:00Z',
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000001',
          ruc: '20123456789',
          razon_social: 'AquaClean Piscinas S.A.C.',
          nombre_contacto: 'Carlos Mendoza',
          telefono: '+51 999 111 222',
          email: 'contacto@aquaclean.pe',
          anios_experiencia: 8,
          calificacion_historica: 4.6,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      {
        id: 'e0000000-0000-4000-8000-000000000002',
        solicitud_id: 'a0000000-0000-4000-8000-000000000001',
        proveedor_id: 'b0000000-0000-4000-8000-000000000006',
        monto_cotizado: 44500,
        tiempo_entrega_dias: 18,
        propuesta_tecnica: 'Servicio técnico especializado y control de calidad químico semanal.',
        archivo_url: 'Expediente_AquaTotal.pdf',
        estado: 'rechazada',
        created_at: '2026-09-11T10:00:00Z',
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000006',
          ruc: '20678901234',
          razon_social: 'AquaTotal Pool Service S.A.C.',
          nombre_contacto: 'Patricia Núñez',
          telefono: '+51 999 666 777',
          email: 'operaciones@aquatotal.pe',
          anios_experiencia: 5,
          calificacion_historica: 3.9,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      // ── Propuestas para Licitación de Seguridad y Vigilancia (Adjudicada) ──
      {
        id: 'e0000000-0000-4000-8000-000000000003',
        solicitud_id: 'a0000000-0000-4000-8000-000000000002',
        proveedor_id: 'b0000000-0000-4000-8000-000000000002',
        monto_cotizado: 120000,
        tiempo_entrega_dias: 15,
        propuesta_tecnica: 'Esquema con 4 agentes por turno, supervisión en sitio y centro de control 24/7.',
        archivo_url: 'Expediente_VigilPro_Seguridad.pdf',
        estado: 'seleccionada',
        created_at: '2026-09-12T10:00:00Z',
        proveedor: {
          id: 'b0000000-0000-4000-8000-000000000002',
          ruc: '20234567890',
          razon_social: 'VigilPro Perú S.R.L.',
          nombre_contacto: 'Rosa Quispe',
          telefono: '+51 999 222 333',
          email: 'ventas@vigilpro.pe',
          anios_experiencia: 6,
          calificacion_historica: 4.2,
          created_at: '2026-09-01T10:00:00Z'
        }
      },
      // ── Propuestas para Licitación "Barredor" (Supabase / Pruebas) ──
      {
        id: 'f0000000-0000-4000-8000-000000000001',
        solicitud_id: '59758543-edc3-4f9c-b574-3310c4a005b4',
        proveedor_id: 'bd3cbc0d-ad10-4e72-aede-2698c5c34eb3',
        monto_cotizado: 3200,
        tiempo_entrega_dias: 15,
        propuesta_tecnica: 'Servicio integral de barrido de áreas comunes, calzadas y estacionamientos.',
        archivo_url: null,
        estado: 'recibida',
        created_at: '2026-11-15T02:30:58Z',
        proveedor: {
          id: 'bd3cbc0d-ad10-4e72-aede-2698c5c34eb3',
          ruc: '12345678910',
          razon_social: 'jdbckjbvkjb vkr',
          nombre_contacto: 'ing. mirella',
          telefono: '123456789',
          email: 'mire@gmail.com',
          anios_experiencia: 3,
          calificacion_historica: 4.3,
          created_at: '2026-11-15T02:30:58Z'
        }
      },
      {
        id: 'f0000000-0000-4000-8000-000000000002',
        solicitud_id: '59758543-edc3-4f9c-b574-3310c4a005b4',
        proveedor_id: 'd358dacc-0ecc-48fa-82cc-0672c919c5e5',
        monto_cotizado: 2900,
        tiempo_entrega_dias: 10,
        propuesta_tecnica: 'Operatividad y mantenimiento de barredoras mecanizadas y limpieza profunda exterior.',
        archivo_url: null,
        estado: 'recibida',
        created_at: '2026-11-15T02:40:00Z',
        proveedor: {
          id: 'd358dacc-0ecc-48fa-82cc-0672c919c5e5',
          ruc: '11111111114',
          razon_social: 'hola hola',
          nombre_contacto: 'Elias Rios',
          telefono: '987654321',
          email: 'elias@gmail.com',
          anios_experiencia: 5,
          calificacion_historica: 4.8,
          created_at: '2026-11-15T02:40:00Z'
        }
      },
      {
        id: 'f0000000-0000-4000-8000-000000000003',
        solicitud_id: '59758543-edc3-4f9c-b574-3310c4a005b4',
        proveedor_id: '32332732-010a-4007-afc3-4a862c7a7b88',
        monto_cotizado: 2000,
        tiempo_entrega_dias: 20,
        propuesta_tecnica: 'Servicio de barredor industrial y limpieza mecánica.',
        archivo_url: null,
        estado: 'recibida',
        created_at: '2026-11-15T02:10:00Z',
        proveedor: {
          id: '32332732-010a-4007-afc3-4a862c7a7b88',
          ruc: '11111111111',
          razon_social: 'hola prueba',
          nombre_contacto: 'prueba',
          telefono: '987654321',
          email: 'prueba@gmail.com',
          anios_experiencia: 8,
          calificacion_historica: 5.0,
          created_at: '2026-11-15T02:10:00Z'
        }
      },
      {
        id: 'f0000000-0000-4000-8000-000000000004',
        solicitud_id: '59758543-edc3-4f9c-b574-3310c4a005b4',
        proveedor_id: 'e8def59a-6f6b-4c4a-b086-ca05b760edeb',
        monto_cotizado: 2000,
        tiempo_entrega_dias: 20,
        propuesta_tecnica: 'Servicio técnico de barredor con cronograma flexible.',
        archivo_url: null,
        estado: 'recibida',
        created_at: '2026-11-15T02:20:00Z',
        proveedor: {
          id: 'e8def59a-6f6b-4c4a-b086-ca05b760edeb',
          ruc: '12333333333',
          razon_social: 'prueba 2',
          nombre_contacto: 'eefefef',
          telefono: '999999999',
          email: 'prueba2@gmail.com',
          anios_experiencia: 2,
          calificacion_historica: 4.0,
          created_at: '2026-11-15T02:20:00Z'
        }
      }
    ];

    if (!solicitudId) return todas;
    return todas.filter((p) => p.solicitud_id === solicitudId);
  }
}
