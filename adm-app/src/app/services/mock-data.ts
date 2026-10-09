/**
 * MODE OFFLINE/MOCK — Base de datos en memoria.
 *
 * Espejo fiel del seed de `supabase_schema.sql` (mismos UUID fijos y valores).
 * Se usa automáticamente cuando `supabaseUrl` / `supabaseKey` están vacíos o
 * cuando la conexión con Supabase falla.
 */
import {
  CategoriaServicio,
  Contrato,
  EvaluacionCriterios,
  Proveedor,
  PropuestaCotizacion,
  SolicitudCotizacion
} from '../interfaces/servicios-externos';

export const MOCK_CATEGORIAS: CategoriaServicio[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    nombre: 'Mantenimiento de Piscinas',
    descripcion: 'Limpieza, tratamiento químico del agua y mantenimiento general de piscinas y áreas húmedas.',
    icono: 'pool',
    activo: true,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    nombre: 'Seguridad y Vigilancia',
    descripcion: 'Seguridad privada, vigilancia nocturna y control de accesos para instalaciones hoteleras.',
    icono: 'security',
    activo: true,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    nombre: 'Jardinería y Paisajismo',
    descripcion: 'Diseño, mantenimiento y paisajismo de áreas verdes y jardines del resort.',
    icono: 'park',
    activo: true,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'c0000000-0000-4000-8000-000000000004',
    nombre: 'Catering y Eventos',
    descripcion: 'Banquetería, alimentación y organización de eventos corporativos y sociales.',
    icono: 'celebration',
    activo: true,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'c0000000-0000-4000-8000-000000000005',
    nombre: 'Mantenimiento Climatización/HVAC',
    descripcion: 'Instalación y mantenimiento preventivo/correctivo de aire acondicionado y ventilación.',
    icono: 'ac_unit',
    activo: true,
    created_at: '2026-09-01T10:00:00Z'
  }
];

export const MOCK_PROVEEDORES: Proveedor[] = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    ruc: '20123456789',
    razon_social: 'AquaClean Piscinas S.A.C.',
    nombre_contacto: 'Carlos Mendoza',
    telefono: '+51 999 111 222',
    email: 'contacto@aquaclean.pe',
    anios_experiencia: 8,
    calificacion_historica: 4.6,
    created_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    ruc: '20234567890',
    razon_social: 'VigilPro Perú S.R.L.',
    nombre_contacto: 'Rosa Quispe',
    telefono: '+51 999 222 333',
    email: 'ventas@vigilpro.pe',
    anios_experiencia: 6,
    calificacion_historica: 4.2,
    created_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    ruc: '20345678901',
    razon_social: 'Jardines del Sol E.I.R.L.',
    nombre_contacto: 'Jorge Ramírez',
    telefono: '+51 999 333 444',
    email: 'info@jardinesdelsol.pe',
    anios_experiencia: 5,
    calificacion_historica: 4.0,
    created_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000004',
    ruc: '20456789012',
    razon_social: 'Sabor & Servicio Catering S.A.C.',
    nombre_contacto: 'María Fernanda Torres',
    telefono: '+51 999 444 555',
    email: 'eventos@saboryservicio.pe',
    anios_experiencia: 10,
    calificacion_historica: 4.8,
    created_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000005',
    ruc: '20567890123',
    razon_social: 'ClimaTotal HVAC S.R.L.',
    nombre_contacto: 'Luis Paredes',
    telefono: '+51 999 555 666',
    email: 'servicio@climatotal.pe',
    anios_experiencia: 7,
    calificacion_historica: 4.6,
    created_at: '2026-09-05T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000006',
    ruc: '20678901234',
    razon_social: 'AquaTotal Pool Service S.A.C.',
    nombre_contacto: 'Patricia Núñez',
    telefono: '+51 999 666 777',
    email: 'operaciones@aquatotal.pe',
    anios_experiencia: 4,
    calificacion_historica: 3.9,
    created_at: '2026-09-06T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000007',
    ruc: '20789012345',
    razon_social: 'Catering del País S.R.L.',
    nombre_contacto: 'Diego Salas',
    telefono: '+51 999 777 888',
    email: 'cotiza@cateringdelpais.pe',
    anios_experiencia: 6,
    calificacion_historica: 4.1,
    created_at: '2026-09-06T10:00:00Z'
  },
  {
    id: 'b0000000-0000-4000-8000-000000000008',
    ruc: '20890123456',
    razon_social: 'Grupo Eventos Iquitos S.A.C.',
    nombre_contacto: 'Adriana Flores',
    telefono: '+51 999 888 999',
    email: 'contacto@grupoeventosiq.pe',
    anios_experiencia: 3,
    calificacion_historica: 3.7,
    created_at: '2026-09-06T10:00:00Z'
  }
];

export const MOCK_SOLICITUDES: SolicitudCotizacion[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    titulo: 'Mantenimiento integral de piscinas del resort',
    categoria_id: 'c0000000-0000-4000-8000-000000000001',
    descripcion: 'Contrato trimestral de mantenimiento preventivo y correctivo para las 3 piscinas, incluido tratamiento químico semanal.',
    presupuesto_referencial: 45000,
    fecha_limite: '2026-10-01',
    estado: 'cerrada',
    created_at: '2026-09-08T10:00:00Z'
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    titulo: 'Servicio de seguridad y vigilancia nocturna',
    categoria_id: 'c0000000-0000-4000-8000-000000000002',
    descripcion: 'Seguridad privada para perímetro y vestíbulos, turnos de 8 horas, por un plazo de 6 meses.',
    presupuesto_referencial: 180000,
    fecha_limite: '2026-12-01',
    estado: 'abierta',
    created_at: '2026-09-10T10:00:00Z'
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    titulo: 'Catering para evento corporativo anual (300 invitados)',
    categoria_id: 'c0000000-0000-4000-8000-000000000004',
    descripcion: 'Banquetería completa: entradas, plato de fondo, postres y bebidas para 300 invitados.',
    presupuesto_referencial: 60000,
    fecha_limite: '2026-11-30',
    estado: 'en_evaluacion',
    created_at: '2026-09-12T10:00:00Z'
  }
];

export const MOCK_PROPUESTAS: PropuestaCotizacion[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    solicitud_id: 'a0000000-0000-4000-8000-000000000001',
    proveedor_id: 'b0000000-0000-4000-8000-000000000001',
    monto_cotizado: 32000,
    tiempo_entrega_dias: 20,
    propuesta_tecnica: 'Plan trimestral con 2 técnicos asignados, monitoreo químico semanal y reporte digital.',
    archivo_url: 'https://cloud.example.com/propuestas/aquaclean_piscinas.pdf',
    estado: 'seleccionada',
    created_at: '2026-09-15T10:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    solicitud_id: 'a0000000-0000-4000-8000-000000000001',
    proveedor_id: 'b0000000-0000-4000-8000-000000000006',
    monto_cotizado: 27500,
    tiempo_entrega_dias: 30,
    propuesta_tecnica: 'Plan básico trimestral con visitas quincenales y reactivos incluidos.',
    archivo_url: 'https://cloud.example.com/propuestas/aquatotal_piscinas.pdf',
    estado: 'rechazada',
    created_at: '2026-09-16T10:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    solicitud_id: 'a0000000-0000-4000-8000-000000000002',
    proveedor_id: 'b0000000-0000-4000-8000-000000000002',
    monto_cotizado: 120000,
    tiempo_entrega_dias: 15,
    propuesta_tecnica: 'Esquema con 4 agentes por turno, supervisión en sitio y centro de control 24/7.',
    archivo_url: 'https://cloud.example.com/propuestas/vigilpro_seguridad.pdf',
    estado: 'recibida',
    created_at: '2026-09-18T10:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000004',
    solicitud_id: 'a0000000-0000-4000-8000-000000000003',
    proveedor_id: 'b0000000-0000-4000-8000-000000000004',
    monto_cotizado: 48000,
    tiempo_entrega_dias: 12,
    propuesta_tecnica: 'Menú ejecutivo premium de 4 tiempos, chef residente y montaje con floristería.',
    archivo_url: 'https://cloud.example.com/propuestas/saboryservicio_catering.pdf',
    estado: 'recibida',
    created_at: '2026-09-20T10:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005',
    solicitud_id: 'a0000000-0000-4000-8000-000000000003',
    proveedor_id: 'b0000000-0000-4000-8000-000000000007',
    monto_cotizado: 39500,
    tiempo_entrega_dias: 18,
    propuesta_tecnica: 'Buffet de 3 estaciones, personal de servicio incluido y alquiler de mobiliario.',
    archivo_url: 'https://cloud.example.com/propuestas/cateringpais_catering.pdf',
    estado: 'recibida',
    created_at: '2026-09-21T10:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000006',
    solicitud_id: 'a0000000-0000-4000-8000-000000000003',
    proveedor_id: 'b0000000-0000-4000-8000-000000000008',
    monto_cotizado: 35000,
    tiempo_entrega_dias: 25,
    propuesta_tecnica: 'Propuesta económica con menú estándar, montaje sencillo y servicio autoservicio.',
    archivo_url: 'https://cloud.example.com/propuestas/grupoeventos_catering.pdf',
    estado: 'recibida',
    created_at: '2026-09-22T10:00:00Z'
  }
];

export const MOCK_EVALUACIONES: EvaluacionCriterios[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    propuesta_id: 'e0000000-0000-4000-8000-000000000001',
    puntaje_costo: 80,
    puntaje_experiencia: 92,
    puntaje_disponibilidad: 95,
    puntaje_historico: 92,
    puntaje_final: 88.4,
    es_top3: true,
    fecha_evaluacion: '2026-10-01T15:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    propuesta_id: 'e0000000-0000-4000-8000-000000000002',
    puntaje_costo: 95,
    puntaje_experiencia: 60,
    puntaje_disponibilidad: 70,
    puntaje_historico: 78,
    puntaje_final: 77.85,
    es_top3: true,
    fecha_evaluacion: '2026-10-01T15:00:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    propuesta_id: 'e0000000-0000-4000-8000-000000000004',
    puntaje_costo: 70,
    puntaje_experiencia: 95,
    puntaje_disponibilidad: 90,
    puntaje_historico: 96,
    puntaje_final: 85.45,
    es_top3: true,
    fecha_evaluacion: '2026-10-02T18:30:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000004',
    propuesta_id: 'e0000000-0000-4000-8000-000000000005',
    puntaje_costo: 95,
    puntaje_experiencia: 80,
    puntaje_disponibilidad: 75,
    puntaje_historico: 82,
    puntaje_final: 84.65,
    es_top3: true,
    fecha_evaluacion: '2026-10-02T18:30:00Z'
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005',
    propuesta_id: 'e0000000-0000-4000-8000-000000000006',
    puntaje_costo: 100,
    puntaje_experiencia: 55,
    puntaje_disponibilidad: 60,
    puntaje_historico: 74,
    puntaje_final: 75.55,
    es_top3: true,
    fecha_evaluacion: '2026-10-02T18:30:00Z'
  }
];

export const MOCK_CONTRATOS: Contrato[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    propuesta_id: 'e0000000-0000-4000-8000-000000000001',
    fecha_inicio: '2026-10-10',
    fecha_fin: '2027-01-10',
    monto_total: 32000,
    terminos: '3 cuotas mensuales. Penalidad del 1% diario por incumplimiento de cronograma. Reactivos químicos incluidos.',
    estado: 'vigente',
    created_at: '2026-10-05T10:00:00Z'
  }
];