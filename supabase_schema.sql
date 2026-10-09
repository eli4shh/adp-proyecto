-- ============================================================================
-- SISTEMA INTELIGENTE DE PLANIFICACIÓN, CONTRATACIÓN Y EVALUACIÓN
-- PARA SERVICIOS EXTERNOS (Hoteles / Resorts) — Supabase / PostgreSQL
-- ============================================================================
-- ⚠️ Ejecutar este script UNA sola vez en: Supabase → SQL Editor.
-- Crea las tablas relacionales, habilita Row Level Security (RLS) y carga
-- datos iniciales de prueba (seed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------

-- 1.1 categorias_servicio (catálogo de categorías de servicio)
create table if not exists public.categorias_servicio (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  icono       text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 1.2 proveedores (empresas externas que se postulan a las licitaciones)
create table if not exists public.proveedores (
  id                   uuid primary key default gen_random_uuid(),
  ruc                  text not null unique,
  razon_social         text not null,
  nombre_contacto      text not null,
  telefono             text not null,
  email                text not null,
  anios_experiencia    integer not null default 0 check (anios_experiencia >= 0),
  calificacion_historica numeric(3,2) not null default 0
    check (calificacion_historica between 0 and 5),
  created_at           timestamptz not null default now()
);

-- 1.3 solicitudes_cotizacion (licitaciones publicadas por el hotel)
create table if not exists public.solicitudes_cotizacion (
  id                      uuid primary key default gen_random_uuid(),
  titulo                  text not null,
  categoria_id            uuid not null references public.categorias_servicio (id) on delete restrict,
  descripcion             text,
  presupuesto_referencial numeric(12,2) check (presupuesto_referencial >= 0),
  fecha_limite            date,
  estado                  text not null default 'abierta'
    check (estado in ('abierta', 'en_evaluacion', 'cerrada')),
  created_at              timestamptz not null default now()
);

-- 1.4 propuestas_cotizacion (ofertas enviadas por los proveedores)
create table if not exists public.propuestas_cotizacion (
  id                  uuid primary key default gen_random_uuid(),
  solicitud_id        uuid not null references public.solicitudes_cotizacion (id) on delete cascade,
  proveedor_id        uuid not null references public.proveedores (id) on delete cascade,
  monto_cotizado      numeric(12,2) not null check (monto_cotizado >= 0),
  tiempo_entrega_dias integer not null check (tiempo_entrega_dias > 0),
  propuesta_tecnica   text,
  archivo_url         text,
  estado              text not null default 'recibida'
    check (estado in ('recibida', 'seleccionada', 'rechazada')),
  created_at          timestamptz not null default now()
);

-- 1.5 evaluaciones_criterios (resultados del algoritmo multicriterio ponderado)
create table if not exists public.evaluaciones_criterios (
  id                      uuid primary key default gen_random_uuid(),
  propuesta_id            uuid not null unique references public.propuestas_cotizacion (id) on delete cascade,
  puntaje_costo           numeric(5,2) not null default 0,
  puntaje_experiencia     numeric(5,2) not null default 0,
  puntaje_disponibilidad  numeric(5,2) not null default 0,
  puntaje_historico       numeric(5,2) not null default 0,
  puntaje_final           numeric(5,2) not null default 0,
  es_top3                 boolean not null default false,
  fecha_evaluacion        timestamptz not null default now(),
  constraint chk_puntajes_0_100 check (
    puntaje_costo between 0 and 100
    and puntaje_experiencia between 0 and 100
    and puntaje_disponibilidad between 0 and 100
    and puntaje_historico between 0 and 100
    and puntaje_final between 0 and 100
  )
);

-- 1.6 contratos (derivados de la propuesta ganadora / adjudicación)
create table if not exists public.contratos (
  id           uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null unique references public.propuestas_cotizacion (id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin    date not null,
  monto_total  numeric(12,2) not null check (monto_total >= 0),
  terminos     text,
  estado       text not null default 'vigente'
    check (estado in ('vigente', 'culminado', 'cancelado')),
  created_at   timestamptz not null default now(),
  constraint chk_fechas_contrato check (fecha_fin >= fecha_inicio)
);

-- ----------------------------------------------------------------------------
-- 2. ÍNDICES
-- ----------------------------------------------------------------------------
create index if not exists idx_solicitudes_categoria
  on public.solicitudes_cotizacion (categoria_id);
create index if not exists idx_solicitudes_estado
  on public.solicitudes_cotizacion (estado);
create index if not exists idx_solicitudes_categoria_estado
  on public.solicitudes_cotizacion (categoria_id, estado);
create index if not exists idx_propuestas_solicitud
  on public.propuestas_cotizacion (solicitud_id);
create index if not exists idx_propuestas_proveedor
  on public.propuestas_cotizacion (proveedor_id);
create index if not exists idx_propuestas_solicitud_estado
  on public.propuestas_cotizacion (solicitud_id, estado);
create index if not exists idx_contratos_estado
  on public.contratos (estado);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

-- 3.1 Habilitar RLS en todas las tablas
alter table public.categorias_servicio enable row level security;
alter table public.proveedores enable row level security;
alter table public.solicitudes_cotizacion enable row level security;
alter table public.propuestas_cotizacion enable row level security;
alter table public.evaluaciones_criterios enable row level security;
alter table public.contratos enable row level security;

-- 3.2 Privilegios base sobre el esquema
grant usage on schema public to anon, authenticated;

-- rol anon (proveedores externos, sin sesión): solo lo mínimo indispensable
grant select on public.categorias_servicio to anon;
grant select on public.solicitudes_cotizacion to anon;
grant insert on public.proveedores to anon;
grant insert on public.propuestas_cotizacion to anon;
grant insert on public.solicitudes_cotizacion to anon;

-- rol authenticated (personal interno / administrador): acceso completo
grant select, insert, update, delete on public.categorias_servicio to authenticated;
grant select, insert, update, delete on public.proveedores to authenticated;
grant select, insert, update, delete on public.solicitudes_cotizacion to authenticated;
grant select, insert, update, delete on public.propuestas_cotizacion to authenticated;
grant select, insert, update, delete on public.evaluaciones_criterios to authenticated;
grant select, insert, update, delete on public.contratos to authenticated;

-- 3.3 Políticas — rol anon (acceso público limitado)

-- Lectura pública: categorías activas (catálogo del formulario público)
create policy "anon_select_categorias_activas"
  on public.categorias_servicio for select to anon
  using (activo = true);

-- Lectura pública: únicamente solicitudes en estado 'abierta'
create policy "anon_select_solicitudes_abiertas"
  on public.solicitudes_cotizacion for select to anon
  using (estado = 'abierta');

-- Inserción pública: proveedores externos registran su ficha (RUC, contacto…)
create policy "anon_insert_proveedores"
  on public.proveedores for insert to anon
  with check (true);

-- Inserción pública: proveedores externos envían sus propuestas
create policy "anon_insert_propuestas"
  on public.propuestas_cotizacion for insert to anon
  with check (true);

-- Inserción pública: el panel operativo publica nuevas licitaciones (modo demo sin sesión)
create policy "anon_insert_solicitudes"
  on public.solicitudes_cotizacion for insert to anon
  with check (true);

-- 3.4 Políticas — rol authenticated (personal interno): lectura/escritura completa
create policy "auth_full_access_categorias"
  on public.categorias_servicio for all to authenticated
  using (true) with check (true);

create policy "auth_full_access_proveedores"
  on public.proveedores for all to authenticated
  using (true) with check (true);

create policy "auth_full_access_solicitudes"
  on public.solicitudes_cotizacion for all to authenticated
  using (true) with check (true);

create policy "auth_full_access_propuestas"
  on public.propuestas_cotizacion for all to authenticated
  using (true) with check (true);

create policy "auth_full_access_evaluaciones"
  on public.evaluaciones_criterios for all to authenticated
  using (true) with check (true);

create policy "auth_full_access_contratos"
  on public.contratos for all to authenticated
  using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 4. SEED — DATOS INICIALES DE PRUEBA
-- ----------------------------------------------------------------------------
-- Se usan UUID fijos para mantener referencias estables entre tablas.
-- Nota: en el SQL Editor los INSERT corren con permisos de administrador
-- (bypass de RLS), por lo que el seed no se ve afectado por las políticas.

-- 4.1 Categorías base (5 requeridas)
insert into public.categorias_servicio (id, nombre, descripcion, icono, activo) values
  ('c0000000-0000-4000-8000-000000000001', 'Mantenimiento de Piscinas',
   'Limpieza, tratamiento químico del agua y mantenimiento general de piscinas y áreas húmedas.', 'pool', true),
  ('c0000000-0000-4000-8000-000000000002', 'Seguridad y Vigilancia',
   'Seguridad privada, vigilancia nocturna y control de accesos para instalaciones hoteleras.', 'security', true),
  ('c0000000-0000-4000-8000-000000000003', 'Jardinería y Paisajismo',
   'Diseño, mantenimiento y paisajismo de áreas verdes y jardines del resort.', 'park', true),
  ('c0000000-0000-4000-8000-000000000004', 'Catering y Eventos',
   'Banquetería, alimentación y organización de eventos corporativos y sociales.', 'celebration', true),
  ('c0000000-0000-4000-8000-000000000005', 'Mantenimiento Climatización/HVAC',
   'Instalación y mantenimiento preventivo/correctivo de aire acondicionado y ventilación.', 'ac_unit', true);

-- 4.2 Proveedores (5 requeridos + 3 adicionales para soportar la evaluación Top 3)
insert into public.proveedores
  (id, ruc, razon_social, nombre_contacto, telefono, email, anios_experiencia, calificacion_historica) values
  ('b0000000-0000-4000-8000-000000000001', '20123456789', 'AquaClean Piscinas S.A.C.', 'Carlos Mendoza', '+51 999 111 222', 'contacto@aquaclean.pe', 8, 4.6),
  ('b0000000-0000-4000-8000-000000000002', '20234567890', 'VigilPro Perú S.R.L.', 'Rosa Quispe', '+51 999 222 333', 'ventas@vigilpro.pe', 6, 4.2),
  ('b0000000-0000-4000-8000-000000000003', '20345678901', 'Jardines del Sol E.I.R.L.', 'Jorge Ramírez', '+51 999 333 444', 'info@jardinesdelsol.pe', 5, 4.0),
  ('b0000000-0000-4000-8000-000000000004', '20456789012', 'Sabor & Servicio Catering S.A.C.', 'María Fernanda Torres', '+51 999 444 555', 'eventos@saboryservicio.pe', 10, 4.8),
  ('b0000000-0000-4000-8000-000000000005', '20567890123', 'ClimaTotal HVAC S.R.L.', 'Luis Paredes', '+51 999 555 666', 'servicio@climatotal.pe', 7, 4.6),
  ('b0000000-0000-4000-8000-000000000006', '20678901234', 'AquaTotal Pool Service S.A.C.', 'Patricia Núñez', '+51 999 666 777', 'operaciones@aquatotal.pe', 4, 3.9),
  ('b0000000-0000-4000-8000-000000000007', '20789012345', 'Catering del País S.R.L.', 'Diego Salas', '+51 999 777 888', 'cotiza@cateringdelpais.pe', 6, 4.1),
  ('b0000000-0000-4000-8000-000000000008', '20890123456', 'Grupo Eventos Iquitos S.A.C.', 'Adriana Flores', '+51 999 888 999', 'contacto@grupoeventosiq.pe', 3, 3.7);

-- 4.3 Solicitudes de cotización (3, en distintos estados de su ciclo de vida)
insert into public.solicitudes_cotizacion
  (id, titulo, categoria_id, descripcion, presupuesto_referencial, fecha_limite, estado) values
  ('a0000000-0000-4000-8000-000000000001', 'Mantenimiento integral de piscinas del resort',
   'c0000000-0000-4000-8000-000000000001',
   'Contrato trimestral de mantenimiento preventivo y correctivo para las 3 piscinas, incluido tratamiento químico semanal.',
   45000.00, '2026-10-01', 'cerrada'),
  ('a0000000-0000-4000-8000-000000000002', 'Servicio de seguridad y vigilancia nocturna',
   'c0000000-0000-4000-8000-000000000002',
   'Seguridad privada para perímetro y vestíbulos, turnos de 8 horas, por un plazo de 6 meses.',
   180000.00, '2026-12-01', 'abierta'),
  ('a0000000-0000-4000-8000-000000000003', 'Catering para evento corporativo anual (300 invitados)',
   'c0000000-0000-4000-8000-000000000004',
   'Banquetería completa: entradas, plato de fondo, postres y bebidas para 300 invitados.',
   60000.00, '2026-11-30', 'en_evaluacion');

-- 4.4 Propuestas de cotización (6 propuestas distribuidas en las 3 solicitudes)
insert into public.propuestas_cotizacion
  (id, solicitud_id, proveedor_id, monto_cotizado, tiempo_entrega_dias, propuesta_tecnica, archivo_url, estado) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   32000.00, 20, 'Plan trimestral con 2 técnicos asignados, monitoreo químico semanal y reporte digital.',
   'https://cloud.example.com/propuestas/aquaclean_piscinas.pdf', 'seleccionada'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006',
   27500.00, 30, 'Plan básico trimestral con visitas quincenales y reactivos incluidos.',
   'https://cloud.example.com/propuestas/aquatotal_piscinas.pdf', 'rechazada'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   120000.00, 15, 'Esquema con 4 agentes por turno, supervisión en sitio y centro de control 24/7.',
   'https://cloud.example.com/propuestas/vigilpro_seguridad.pdf', 'recibida'),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004',
   48000.00, 12, 'Menú ejecutivo premium de 4 tiempos, chef residente y montaje con floristería.',
   'https://cloud.example.com/propuestas/saboryservicio_catering.pdf', 'recibida'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000007',
   39500.00, 18, 'Buffet de 3 estaciones, personal de servicio incluido y alquiler de mobiliario.',
   'https://cloud.example.com/propuestas/cateringpais_catering.pdf', 'recibida'),
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000008',
   35000.00, 25, 'Propuesta económica con menú estándar, montaje sencillo y servicio autoservicio.',
   'https://cloud.example.com/propuestas/grupoeventos_catering.pdf', 'recibida');

-- 4.5 Evaluaciones multicriterio (resultado esperado del algoritmo:
--     Costo 35% · Experiencia 25% · Disponibilidad 20% · Histórico 20%)
insert into public.evaluaciones_criterios
  (propuesta_id, puntaje_costo, puntaje_experiencia, puntaje_disponibilidad, puntaje_historico, puntaje_final, es_top3, fecha_evaluacion) values
  ('e0000000-0000-4000-8000-000000000001', 80.00, 92.00, 95.00, 92.00, 88.40, true, '2026-10-01T15:00:00Z'),
  ('e0000000-0000-4000-8000-000000000002', 95.00, 60.00, 70.00, 78.00, 77.85, true, '2026-10-01T15:00:00Z'),
  ('e0000000-0000-4000-8000-000000000004', 70.00, 95.00, 90.00, 96.00, 85.45, true, '2026-10-02T18:30:00Z'),
  ('e0000000-0000-4000-8000-000000000005', 95.00, 80.00, 75.00, 82.00, 84.65, true, '2026-10-02T18:30:00Z'),
  ('e0000000-0000-4000-8000-000000000006', 100.00, 55.00, 60.00, 74.00, 75.55, true, '2026-10-02T18:30:00Z');

-- 4.6 Contrato demo (derivado de la licitación de piscinas ya cerrada)
insert into public.contratos
  (id, propuesta_id, fecha_inicio, fecha_fin, monto_total, terminos, estado) values
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   '2026-10-10', '2027-01-10', 32000.00,
   '3 cuotas mensuales. Penalidad del 1% diario por incumplimiento de cronograma. Reactivos químicos incluidos.', 'vigente');

-- ============================================================================
-- FIN DEL SCRIPT — Datos listos para probar el flujo completo.
-- ============================================================================