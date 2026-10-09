/**
 * Interfaces TypeScript espejo de las 6 tablas de `supabase_schema.sql`.
 * Cada interfaz tipa exactamente los campos relacionales definidos en el DDL.
 */

// ---------------------------------------------------------------------------
// categorias_servicio
// ---------------------------------------------------------------------------
export interface CategoriaServicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  activo: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// proveedores
// ---------------------------------------------------------------------------
export interface Proveedor {
  id: string;
  ruc: string;
  razon_social: string;
  nombre_contacto: string;
  telefono: string;
  email: string;
  anios_experiencia: number;
  /** Escala 0 a 5 (0.00 – 5.00). */
  calificacion_historica: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// solicitudes_cotizacion
// ---------------------------------------------------------------------------
export type EstadoSolicitud = 'abierta' | 'en_evaluacion' | 'cerrada';

export interface SolicitudCotizacion {
  id: string;
  titulo: string;
  categoria_id: string;
  descripcion: string | null;
  presupuesto_referencial: number | null;
  /** Formato YYYY-MM-DD */
  fecha_limite: string | null;
  estado: EstadoSolicitud;
  created_at: string;
  /** Join opcional (Supabase `*categorias_servicio` / join en memoria). */
  categoria?: CategoriaServicio;
}

// ---------------------------------------------------------------------------
// propuestas_cotizacion
// ---------------------------------------------------------------------------
export type EstadoPropuesta = 'recibida' | 'seleccionada' | 'rechazada';

export interface PropuestaCotizacion {
  id: string;
  solicitud_id: string;
  proveedor_id: string;
  monto_cotizado: number;
  tiempo_entrega_dias: number;
  propuesta_tecnica: string | null;
  archivo_url: string | null;
  estado: EstadoPropuesta;
  created_at: string;
  /** Joins opcionales. */
  proveedor?: Proveedor;
  solicitud?: SolicitudCotizacion;
}

// ---------------------------------------------------------------------------
// evaluaciones_criterios
// ---------------------------------------------------------------------------
export interface EvaluacionCriterios {
  id: string;
  propuesta_id: string;
  /** Todos los puntajes en escala 0 – 100. */
  puntaje_costo: number;
  puntaje_experiencia: number;
  puntaje_disponibilidad: number;
  puntaje_historico: number;
  puntaje_final: number;
  es_top3: boolean;
  fecha_evaluacion: string;
  /** Join opcional para la vista de evaluación. */
  propuesta?: PropuestaCotizacion;
}

// ---------------------------------------------------------------------------
// contratos
// ---------------------------------------------------------------------------
export type EstadoContrato = 'vigente' | 'culminado' | 'cancelado';

export interface Contrato {
  id: string;
  propuesta_id: string;
  /** Formato YYYY-MM-DD */
  fecha_inicio: string;
  /** Formato YYYY-MM-DD */
  fecha_fin: string;
  monto_total: number;
  terminos: string | null;
  estado: EstadoContrato;
  created_at: string;
  /** Join opcional para la vista de contratos. */
  propuesta?: PropuestaCotizacion;
}

// ---------------------------------------------------------------------------
// Payloads de escritura (formulario público y adjudicación)
// ---------------------------------------------------------------------------
export interface NuevoProveedor {
  ruc: string;
  razon_social: string;
  nombre_contacto: string;
  telefono: string;
  email: string;
  anios_experiencia: number;
}

export interface NuevaPropuesta {
  solicitud_id: string;
  monto_cotizado: number;
  tiempo_entrega_dias: number;
  propuesta_tecnica: string | null;
  archivo_url: string | null;
}

export interface PostulacionPayload {
  proveedor: NuevoProveedor;
  propuesta: NuevaPropuesta;
}

export interface DatosContrato {
  propuesta_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  terminos: string | null;
}

/** Payload para publicar una nueva licitación/solicitud de cotización. */
export interface NuevaSolicitudPayload {
  titulo: string;
  categoria_id: string;
  descripcion: string | null;
  presupuesto_referencial: number | null;
  /** Formato YYYY-MM-DD */
  fecha_limite: string | null;
}

export type FiltrosSolicitud = {
  estado?: EstadoSolicitud;
  categoriaId?: string;
};