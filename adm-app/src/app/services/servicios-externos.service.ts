import { Injectable, inject } from '@angular/core';
import { Observable, Subject, from, throwError } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { SupabaseService } from '../core/services/supabase.service';
import {
  CategoriaServicio,
  Contrato,
  DatosContrato,
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
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    if (!this.categoriasCache$) {
      this.categoriasCache$ = from(
        this.supabase.from('categorias_servicio').select('*').order('nombre')
      ).pipe(
        map((res) => this.extraerDatos<CategoriaServicio>(res)),
        shareReplay(1)
      );
    }
    return this.categoriasCache$;
  }

  listarSolicitudes(filtros: FiltrosSolicitud = {}): Observable<SolicitudCotizacion[]> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    return this.obtenerSolicitudesCache().pipe(
      map((todas) => todas.filter((s) => this.cumpleFiltros(s, filtros)))
    );
  }

  private obtenerSolicitudesCache(): Observable<SolicitudCotizacion[]> {
    if (!this.solicitudesCache$) {
      this.solicitudesCache$ = from(
        this.supabase!
          .from('solicitudes_cotizacion')
          .select('*, categoria:categorias_servicio(*)')
          .order('created_at', { ascending: false })
      ).pipe(
        map((res) => this.extraerDatos<SolicitudCotizacion>(res)),
        shareReplay(1)
      );
    }
    return this.solicitudesCache$;
  }

  private cumpleFiltros(s: SolicitudCotizacion, filtros: FiltrosSolicitud): boolean {
    const okEstado = !filtros.estado || s.estado === filtros.estado;
    const okCategoria = !filtros.categoriaId || s.categoria_id === filtros.categoriaId;
    return okEstado && okCategoria;
  }

  listarPropuestas(solicitudId?: string): Observable<PropuestaCotizacion[]> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    let query = this.supabase.from('propuestas_cotizacion').select('*, proveedor:proveedores(*)');
    if (solicitudId) query = query.eq('solicitud_id', solicitudId);
    return from(query.order('created_at', { ascending: false })).pipe(
      map((res) => this.extraerDatos<PropuestaCotizacion>(res))
    );
  }

  listarProveedores(): Observable<Proveedor[]> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    return from(this.supabase.from('proveedores').select('*').order('razon_social')).pipe(
      map((res) => this.extraerDatos<Proveedor>(res))
    );
  }

  listarEvaluaciones(): Observable<EvaluacionCriterios[]> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    return from(
      this.supabase
        .from('evaluaciones_criterios')
        .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*))')
    ).pipe(
      map((res) => this.extraerDatos<EvaluacionCriterios>(res))
    );
  }

  listarContratos(): Observable<Contrato[]> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    return from(
      this.supabase
        .from('contratos')
        .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*))')
        .order('created_at', { ascending: false })
    ).pipe(
      map((res) => this.extraerDatos<Contrato>(res))
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
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    this.solicitudesCache$ = null;
    return from(
      this.supabase
        .from('solicitudes_cotizacion')
        .insert({
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
          return res.data as SolicitudCotizacion;
        })
    ).pipe(
      tap(() => this.refrescarCatalogoSolicitudesAbiertas())
    );
  }

  enviarPostulacion(
    payload: PostulacionPayload
  ): Observable<{ proveedor: Proveedor; propuesta: PropuestaCotizacion }> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    return from(
      this.supabase
        .from('proveedores')
        .insert(payload.proveedor)
        .select()
        .single()
        .then((resProv: RespuestaSupabase) => {
          if (resProv.error) throw resProv.error;
          const proveedor = resProv.data as Proveedor;
          return this.supabase!
            .from('propuestas_cotizacion')
            .insert({ ...payload.propuesta, proveedor_id: proveedor.id })
            .select()
            .single()
            .then((resProp: RespuestaSupabase) => {
              if (resProp.error) throw resProp.error;
              return { proveedor, propuesta: resProp.data as PropuestaCotizacion };
            });
        })
    );
  }

  guardarEvaluaciones(registros: RegistroEvaluacion[]): Observable<EvaluacionCriterios[]> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
    }
    return from(
      this.supabase
        .from('evaluaciones_criterios')
        .upsert(registros, { onConflict: 'propuesta_id' })
        .select()
    ).pipe(
      map((res) => this.extraerDatos<EvaluacionCriterios>(res))
    );
  }

  adjudicarContrato(datos: DatosContrato): Observable<Contrato> {
    if (!this.supabase) {
      return throwError(() => new Error('Sin conexión a Supabase. Configura el archivo .env con SUPABASE_URL y SUPABASE_KEY.'));
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

          return cliente
            .from('propuestas_cotizacion')
            .update({ estado: 'seleccionada' })
            .eq('id', datos.propuesta_id)
            .then((resUpd: RespuestaSupabase) => {
              if (resUpd.error) throw resUpd.error;
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