import { Injectable, inject } from '@angular/core';
import { Observable, Subject, from, of } from 'rxjs';
import { catchError, map, shareReplay, tap, timeout } from 'rxjs/operators';
import { SupabaseService } from '../core/services/supabase.service';
import {
  CategoriaServicio,
  Contrato,
  DatosContrato,
  EvaluacionCriterios,
  FiltrosSolicitud,
  NuevoProveedor,
  NuevaPropuesta,
  NuevaSolicitudPayload,
  PostulacionPayload,
  Proveedor,
  PropuestaCotizacion,
  SolicitudCotizacion
} from '../interfaces/servicios-externos';
import { RegistroEvaluacion } from './evaluacion.service';
import {
  MOCK_CATEGORIAS,
  MOCK_CONTRATOS,
  MOCK_EVALUACIONES,
  MOCK_PROVEEDORES,
  MOCK_PROPUESTAS,
  MOCK_SOLICITUDES
} from './mock-data';

type RespuestaSupabase = { data: unknown; error: unknown };

/**
 * Capa de datos de servicios externos.
 *
 * - Si NO hay credenciales Supabase (o la conexión falla) opera con la base
 *   en memoria (mock) usando el estado interno iniciado con el seed.
 * - Si hay credenciales, consulta Supabase y ante cualquier error deriva
 *   automáticamente a los datos mock (modo resiliente).
 */
@Injectable({ providedIn: 'root' })
export class ServiciosExternosService {
  private readonly supabaseService = inject(SupabaseService);

  // Estado interno (modo mock). Se inicia con el seed y muta en la sesión.
  private categorias: CategoriaServicio[] = [...MOCK_CATEGORIAS];
  private proveedores: Proveedor[] = [...MOCK_PROVEEDORES];
  private solicitudes: SolicitudCotizacion[] = [...MOCK_SOLICITUDES];
  private propuestas: PropuestaCotizacion[] = [...MOCK_PROPUESTAS];
  private evaluaciones: EvaluacionCriterios[] = [...MOCK_EVALUACIONES];
  private contratos: Contrato[] = [...MOCK_CONTRATOS];

  // Catálogo reactivo de solicitudes en estado 'abierta' (select del formulario público).
  private readonly solicitudesAbiertasSubject = new Subject<SolicitudCotizacion[]>();

  // Caché en memoria (shareReplay): evita repetir peticiones HTTP al navegar.
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

  private get usarMock(): boolean {
    return this.supabaseService.usarMock;
  }

  // ---------------------------------------------------------------------------
  // LECTURAS
  // ---------------------------------------------------------------------------

  /**
   * Catálogo de categorías con caché en memoria (`shareReplay`): la primera
   * llamada consulta Supabase y el resto de la sesión se responde desde caché.
   */
  listarCategorias(): Observable<CategoriaServicio[]> {
    if (this.usarMock) return of([...this.categorias]);
    if (!this.categoriasCache$) {
      this.categoriasCache$ = from(
        this.supabase!.from('categorias_servicio').select('*').order('nombre')
      ).pipe(
        map((res) => this.extraerDatos<CategoriaServicio>(res)),
        timeout(3000),
        catchError((err) => this.fallback('listarCategorias', err, [...this.categorias])),
        shareReplay(1)
      );
    }
    return this.categoriasCache$;
  }

  /**
   * Lista de solicitudes con caché en memoria (los filtros se aplican sobre la
   * caché del catálogo completo). Navegar entre pantallas no repite la petición
   * HTTP; la caché se invalida al publicar o adjudicar para no servir datos viejos.
   */
  listarSolicitudes(filtros: FiltrosSolicitud = {}): Observable<SolicitudCotizacion[]> {
    if (this.usarMock) {
      return of(
        this.enriquecerSolicitudes(this.solicitudes.filter((s) => this.cumpleFiltros(s, filtros)))
      );
    }
    return this.obtenerSolicitudesCache().pipe(
      map((todas) => this.enriquecerSolicitudes(todas.filter((s) => this.cumpleFiltros(s, filtros))))
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
        timeout(3000),
        catchError((err) =>
          this.fallback('listarSolicitudes', err, this.enriquecerSolicitudes([...this.solicitudes]))
        ),
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
    const resultadoMock = this.enriquecerPropuestas(
      solicitudId
        ? this.propuestas.filter((p) => p.solicitud_id === solicitudId)
        : [...this.propuestas]
    );
    if (this.usarMock) return of(resultadoMock);

    let query = this.supabase!.from('propuestas_cotizacion').select('*, proveedor:proveedores(*)');
    if (solicitudId) query = query.eq('solicitud_id', solicitudId);
    return from(query.order('created_at', { ascending: false })).pipe(
      map((res) => this.extraerDatos<PropuestaCotizacion>(res)),
      timeout(3000),
      catchError((err) => this.fallback('listarPropuestas', err, resultadoMock))
    );
  }

  listarProveedores(): Observable<Proveedor[]> {
    if (this.usarMock) return of([...this.proveedores]);
    return from(this.supabase!.from('proveedores').select('*').order('razon_social')).pipe(
      map((res) => this.extraerDatos<Proveedor>(res)),
      timeout(3000),
      catchError((err) => this.fallback('listarProveedores', err, [...this.proveedores]))
    );
  }

  listarEvaluaciones(): Observable<EvaluacionCriterios[]> {
    const evaluacionesEnriquecidas = this.enriquecerEvaluaciones([...this.evaluaciones]);
    if (this.usarMock) return of(evaluacionesEnriquecidas);
    return from(
      this.supabase!
        .from('evaluaciones_criterios')
        .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*))')
    ).pipe(
      map((res) => this.extraerDatos<EvaluacionCriterios>(res)),
      timeout(3000),
      catchError((err) => this.fallback('listarEvaluaciones', err, evaluacionesEnriquecidas))
    );
  }

  listarContratos(): Observable<Contrato[]> {
    const contratosEnriquecidos = this.enriquecerContratos([...this.contratos]);
    if (this.usarMock) return of(contratosEnriquecidos);
    return from(
      this.supabase!
        .from('contratos')
        .select('*, propuesta:propuestas_cotizacion(*, proveedor:proveedores(*))')
        .order('created_at', { ascending: false })
    ).pipe(
      map((res) => this.extraerDatos<Contrato>(res)),
      timeout(3000),
      catchError((err) => this.fallback('listarContratos', err, contratosEnriquecidos))
    );
  }

  /** Stream reactivo de solicitudes en estado 'abierta' (select del formulario público). */
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

  // ---------------------------------------------------------------------------
  // JOINS EN MEMORIA (comunes a modo mock y al respaldo)
  // ---------------------------------------------------------------------------

  private enriquecerSolicitudes(items: SolicitudCotizacion[]): SolicitudCotizacion[] {
    const categorias = new Map(this.categorias.map((c) => [c.id, c]));
    return items.map((s) => ({ ...s, categoria: categorias.get(s.categoria_id) }));
  }

  private enriquecerPropuesta(propuesta: PropuestaCotizacion): PropuestaCotizacion {
    const proveedor = this.proveedores.find((p) => p.id === propuesta.proveedor_id);
    const solicitud = this.solicitudes.find((s) => s.id === propuesta.solicitud_id);
    const conSolicitud = solicitud
      ? { ...propuesta, solicitud }
      : { ...propuesta, solicitud: undefined };
    return proveedor ? { ...conSolicitud, proveedor } : conSolicitud;
  }

  private enriquecerPropuestas(items: PropuestaCotizacion[]): PropuestaCotizacion[] {
    return items.map((p) => this.enriquecerPropuesta(p));
  }

  private enriquecerEvaluaciones(items: EvaluacionCriterios[]): EvaluacionCriterios[] {
    return items.map((e) => {
      const propuesta = this.propuestas.find((p) => p.id === e.propuesta_id);
      return propuesta ? { ...e, propuesta: this.enriquecerPropuesta(propuesta) } : { ...e };
    });
  }

  private enriquecerContratos(items: Contrato[]): Contrato[] {
    return items.map((c) => {
      const propuesta = this.propuestas.find((p) => p.id === c.propuesta_id);
      return propuesta ? { ...c, propuesta: this.enriquecerPropuesta(propuesta) } : { ...c };
    });
  }

  // ---------------------------------------------------------------------------
  // ESCRITURAS
  // ---------------------------------------------------------------------------

  /** Publica una nueva licitación/solicitud de cotización en estado 'abierta'. */
  crearSolicitud(data: NuevaSolicitudPayload): Observable<SolicitudCotizacion> {
    // La publicación modifica el catálogo: la próxima lectura debe re-consultar.
    this.solicitudesCache$ = null;
    if (this.usarMock) {
      const creada = this.insertarSolicitudMock(data);
      this.refrescarCatalogoSolicitudesAbiertas();
      return of(creada);
    }
    return from(
      this.supabase!
        .from('solicitudes_cotizacion')
        .insert({
          titulo: data.titulo,
          categoria_id: data.categoria_id,
          descripcion: data.descripcion,
          presupuesto_referencial: data.presupuesto_referencial,
          fecha_limite: data.fecha_limite,
          estado: 'abierta'
        })
        .select()
        .single()
        .then((res: RespuestaSupabase) => {
          if (res.error) throw res.error;
          return res.data as SolicitudCotizacion;
        })
    ).pipe(
      map((nueva) => this.enriquecerSolicitudes([nueva])[0]),
      timeout(3000),
      catchError((err) => {
        console.warn(
          '[ServiciosExternosService] Supabase no permitió publicar la licitación, usando mock.',
          err
        );
        return of(this.insertarSolicitudMock(data));
      }),
      tap(() => this.refrescarCatalogoSolicitudesAbiertas())
    );
  }

  /** Registra (o reutiliza) el proveedor y crea su propuesta. Flujo público anónimo. */
  enviarPostulacion(
    payload: PostulacionPayload
  ): Observable<{ proveedor: Proveedor; propuesta: PropuestaCotizacion }> {
    if (this.usarMock) {
      return of(this.crearPostulacionMock(payload));
    }

    return from(
      this.supabase!
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
    ).pipe(
      timeout(3000),
      catchError((err) => {
        console.warn('[ServiciosExternosService] Supabase no disponible para postular, usando mock.', err);
        return of(this.crearPostulacionMock(payload));
      })
    );
  }

  /** Persiste el ranking de evaluación (upsert por propuesta_id). */
  guardarEvaluaciones(registros: RegistroEvaluacion[]): Observable<EvaluacionCriterios[]> {
    if (this.usarMock) {
      return of(this.guardarEvaluacionesMock(registros));
    }
    return from(
      this.supabase!
        .from('evaluaciones_criterios')
        .upsert(registros, { onConflict: 'propuesta_id' })
        .select()
    ).pipe(
      map((res) => this.extraerDatos<EvaluacionCriterios>(res)),
      timeout(3000),
      catchError((err) => {
        console.warn('[ServiciosExternosService] No se pudieron guardar evaluaciones en Supabase, usando mock.', err);
        return of(this.guardarEvaluacionesMock(registros));
      })
    );
  }

  /** Adjudica la propuesta ganadora: contrato nuevo + estados actualizados. */
  adjudicarContrato(datos: DatosContrato): Observable<Contrato> {
    // La adjudicación cierra la solicitud: invalida la caché del catálogo.
    this.solicitudesCache$ = null;
    if (this.usarMock) {
      return of(this.adjudicarContratoMock(datos));
    }
    const cliente = this.supabase!;
    return from(
      // 1. Obtener la propuesta para conocer monto_cotizado y solicitud_id
      cliente
        .from('propuestas_cotizacion')
        .select('id, monto_cotizado, solicitud_id')
        .eq('id', datos.propuesta_id)
        .single()
        .then((resFetch: RespuestaSupabase) => {
          if (resFetch.error) throw resFetch.error;
          const propuesta = resFetch.data as { id: string; monto_cotizado: number; solicitud_id: string };

          // 2. Marcar la propuesta como 'seleccionada'
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
          // 3. Cerrar la solicitud vinculada
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
          // 4. Insertar el contrato con todos los campos requeridos por la BD
          const payload = {
            propuesta_id: datos.propuesta_id,
            fecha_inicio: datos.fecha_inicio,
            fecha_fin: datos.fecha_fin,
            monto_total: propuesta.monto_cotizado,
            terminos: datos.terminos ?? null,
            estado: 'vigente'
          };
          return cliente.from('contratos').insert(payload).select().single();
        })
        .then((resContrato: RespuestaSupabase) => {
          if (resContrato.error) throw resContrato.error;
          // Invalida caché tras cerrar la solicitud
          this.solicitudesCache$ = null;
          return resContrato.data as Contrato;
        })
    ).pipe(
      map((contrato) => this.enriquecerContratos([contrato])[0]),
      timeout(8000),
      catchError((err) => {
        console.warn('[ServiciosExternosService] No se pudo adjudicar en Supabase, usando mock.', err);
        return of(this.adjudicarContratoMock(datos));
      })
    );
  }

  // ---------------------------------------------------------------------------
  // MUTACIONES MOCK (compartidas por el modo offline y los fallbacks)
  // ---------------------------------------------------------------------------

  private insertarSolicitudMock(data: NuevaSolicitudPayload): SolicitudCotizacion {
    const nueva: SolicitudCotizacion = {
      id: this.generarUuid(),
      titulo: data.titulo,
      categoria_id: data.categoria_id,
      descripcion: data.descripcion,
      presupuesto_referencial: data.presupuesto_referencial,
      fecha_limite: data.fecha_limite,
      estado: 'abierta',
      created_at: new Date().toISOString()
    };
    this.solicitudes = [nueva, ...this.solicitudes];
    return this.enriquecerSolicitudes([nueva])[0];
  }

  private crearPostulacionMock(
    payload: PostulacionPayload
  ): { proveedor: Proveedor; propuesta: PropuestaCotizacion } {
    const existente = this.proveedores.find((p) => p.ruc === payload.proveedor.ruc);
    const proveedor =
      existente ?? this.insertarProveedor({ ...payload.proveedor, calificacion_historica: 0 });
    const propuesta = this.insertarPropuesta(payload.propuesta, proveedor.id);
    return { proveedor, propuesta };
  }

  private insertarProveedor(datos: NuevoProveedor & { calificacion_historica: number }): Proveedor {
    const nuevo: Proveedor = {
      id: this.generarId('pro'),
      ...datos,
      created_at: new Date().toISOString()
    };
    this.proveedores = [nuevo, ...this.proveedores];
    return nuevo;
  }

  private insertarPropuesta(datos: NuevaPropuesta, proveedorId: string): PropuestaCotizacion {
    const nueva: PropuestaCotizacion = {
      id: this.generarId('prop'),
      ...datos,
      proveedor_id: proveedorId,
      estado: 'recibida',
      created_at: new Date().toISOString()
    };
    this.propuestas = [nueva, ...this.propuestas];
    return nueva;
  }

  private guardarEvaluacionesMock(registros: RegistroEvaluacion[]): EvaluacionCriterios[] {
    const ids = new Set(registros.map((r) => r.propuesta_id));
    const base = this.evaluaciones.filter((e) => !ids.has(e.propuesta_id));
    const nuevas: EvaluacionCriterios[] = registros.map((r) => ({
      id: this.generarId('ev'),
      propuesta_id: r.propuesta_id,
      puntaje_costo: r.puntaje_costo,
      puntaje_experiencia: r.puntaje_experiencia,
      puntaje_disponibilidad: r.puntaje_disponibilidad,
      puntaje_historico: r.puntaje_historico,
      puntaje_final: r.puntaje_final,
      es_top3: r.es_top3,
      fecha_evaluacion: r.fecha_evaluacion
    }));
    this.evaluaciones = [...nuevas, ...base];
    return this.enriquecerEvaluaciones(nuevas);
  }

  private adjudicarContratoMock(datos: DatosContrato): Contrato {
    const propuesta = this.propuestas.find((p) => p.id === datos.propuesta_id);
    if (propuesta) {
      this.propuestas = this.propuestas.map((p) =>
        p.id === datos.propuesta_id ? { ...p, estado: 'seleccionada' } : p
      );
      const solicitud = this.solicitudes.find((s) => s.id === propuesta.solicitud_id);
      if (solicitud) {
        this.solicitudes = this.solicitudes.map((s) =>
          s.id === solicitud.id ? { ...s, estado: 'cerrada' } : s
        );
      }
    }
    const contrato: Contrato = {
      id: this.generarId('con'),
      propuesta_id: datos.propuesta_id,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      monto_total: propuesta?.monto_cotizado ?? 0,
      terminos: datos.terminos,
      estado: 'vigente',
      created_at: new Date().toISOString()
    };
    this.contratos = [contrato, ...this.contratos];
    return this.enriquecerContratos([contrato])[0];
  }

  // ---------------------------------------------------------------------------
  // UTILITARIOS
  // ---------------------------------------------------------------------------

  private extraerDatos<T>(res: RespuestaSupabase): T[] {
    if (res.error) throw res.error;
    return (res.data ?? []) as T[];
  }

  private fallback<T>(operacion: string, err: unknown, datoMock: T): Observable<T> {
    console.warn(
      `[ServiciosExternosService] Supabase no responde en "${operacion}", usando datos mock.`,
      err
    );
    return of(datoMock);
  }

  private generarId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Genera un UUID v4 (solo dígitos hexadecimales) para registros en modo mock. */
  private generarUuid(): string {
    const cripto = window.crypto;
    if (cripto && typeof cripto.randomUUID === 'function') {
      return cripto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}