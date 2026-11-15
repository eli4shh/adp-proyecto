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
        this.categoriasCache$ = of([]).pipe(shareReplay(1));
      } else {
        this.categoriasCache$ = from(
          this.supabase.from('categorias_servicio').select('*').order('nombre')
        ).pipe(
          map((res) => this.extraerDatos<CategoriaServicio>(res)),
          catchError(() => of([])),
          shareReplay(1)
        );
      }
    }
    return this.categoriasCache$;
  }

  listarSolicitudes(filtros: FiltrosSolicitud = {}): Observable<SolicitudCotizacion[]> {
    return this.obtenerSolicitudesCache().pipe(
      map((todas) => todas.filter((s) => this.cumpleFiltros(s, filtros)))
    );
  }

  private readonly STORAGE_SOLICITUDES_KEY = 'gm_solicitudes_locales_v1';

  obtenerSolicitudesDeStorage(): SolicitudCotizacion[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = localStorage.getItem(this.STORAGE_SOLICITUDES_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      const validas = list.filter(
        (s): s is SolicitudCotizacion =>
          !!s &&
          typeof s === 'object' &&
          typeof s.id === 'string' &&
          s.id.trim().length > 0 &&
          typeof s.titulo === 'string' &&
          s.titulo.trim().length > 0
      );
      if (validas.length !== list.length) {
        localStorage.setItem(this.STORAGE_SOLICITUDES_KEY, JSON.stringify(validas));
      }
      return validas;
    } catch {
      return [];
    }
  }

  guardarSolicitudEnStorage(s: SolicitudCotizacion): void {
    try {
      if (!s || !s.id || !s.titulo) return;
      if (typeof window === 'undefined' || !window.localStorage) return;
      const list = this.obtenerSolicitudesDeStorage();
      const filtradas = list.filter((item) => item.id !== s.id);
      filtradas.unshift(s);
      localStorage.setItem(this.STORAGE_SOLICITUDES_KEY, JSON.stringify(filtradas));
    } catch {}
  }

  private obtenerSolicitudesCache(): Observable<SolicitudCotizacion[]> {
    if (!this.solicitudesCache$) {
      if (!this.supabase) {
        this.solicitudesCache$ = of(this.obtenerSolicitudesDeStorage()).pipe(shareReplay(1));
      } else {
        this.solicitudesCache$ = from(
          this.supabase
            .from('solicitudes_cotizacion')
            .select('*, categoria:categorias_servicio(*)')
            .order('created_at', { ascending: false })
        ).pipe(
          map((res) => {
            const datos = this.extraerDatos<SolicitudCotizacion>(res);
            const validas = datos.filter((s) => !!s && !!s.id && !!s.titulo);
            return validas.length > 0 ? validas : this.obtenerSolicitudesDeStorage();
          }),
          catchError(() => of(this.obtenerSolicitudesDeStorage())),
          shareReplay(1)
        );
      }
    }
    return this.solicitudesCache$;
  }

  private cumpleFiltros(s: SolicitudCotizacion, filtros: FiltrosSolicitud): boolean {
    if (!s || !s.id || !s.titulo) return false;
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
      const validas = list.filter(
        (p): p is PropuestaCotizacion =>
          !!p &&
          typeof p === 'object' &&
          typeof p.id === 'string' &&
          p.id.trim().length > 0 &&
          typeof p.solicitud_id === 'string' &&
          p.solicitud_id.trim().length > 0
      );
      if (validas.length !== list.length) {
        localStorage.setItem(this.STORAGE_PROPUESTAS_KEY, JSON.stringify(validas));
      }
      if (!solicitudId) return validas;
      return validas.filter((p) => p.solicitud_id === solicitudId);
    } catch {
      return [];
    }
  }

  private guardarEnStorage(propuesta: PropuestaCotizacion) {
    try {
      if (!propuesta || !propuesta.id || !propuesta.solicitud_id) return;
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
    if (!this.supabase) {
      return of(this.obtenerPropuestasDeStorage(solicitudId));
    }

    let query = this.supabase.from('propuestas_cotizacion').select('*, proveedor:proveedores(*)');
    if (solicitudId) query = query.eq('solicitud_id', solicitudId);

    return from(query.order('created_at', { ascending: false })).pipe(
      map((res) => this.extraerDatos<PropuestaCotizacion>(res)),
      catchError(() => of(this.obtenerPropuestasDeStorage(solicitudId)))
    );
  }

  listarProveedores(): Observable<Proveedor[]> {
    if (!this.supabase) {
      return of([]);
    }
    return from(this.supabase.from('proveedores').select('*').order('razon_social')).pipe(
      map((res) => this.extraerDatos<Proveedor>(res)),
      catchError(() => of([]))
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
      error: () => this.solicitudesAbiertasSubject.next([])
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
}
