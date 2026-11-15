import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import type { User } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { ServiciosExternosService } from '../../services/servicios-externos.service';
import { EvaluacionService } from '../../services/evaluacion.service';
import {
  CategoriaServicio,
  EstadoPropuesta,
  EstadoSolicitud,
  PropuestaCotizacion,
  SolicitudCotizacion
} from '../../interfaces/servicios-externos';
import { NuevaLicitacionComponent } from '../nueva-licitacion/nueva-licitacion';
import { AuthNavComponent } from '../auth-nav/auth-nav';

/**
 * Bandeja de cotizaciones recibidas (ruta /cotizaciones, operaciones/compras).
 * Muestra solicitudes con sus propuestas, filtros por categoría/estado y un
 * botón para ejecutar la evaluación multicriterio automática.
 */
@Component({
  selector: 'app-cotizaciones',
  standalone: true,
  imports: [CommonModule, RouterLink, NuevaLicitacionComponent],
  templateUrl: './panel.html',
  styleUrls: ['./panel.css']
})
export class PanelComponent implements OnInit, OnDestroy {
  categorias: CategoriaServicio[] = [];
  solicitudes: SolicitudCotizacion[] = [];
  propuestasPorSolicitud = new Map<string, PropuestaCotizacion[]>();
  filtroCategoria = '';
  filtroEstado = '';
  filtroBusqueda = '';
  cargando = true;
  evaluandoIds = new Set<string>();
  private suscripciones: Subscription[] = [];

  readonly etiquetaEstado: Record<EstadoSolicitud, string> = {
    abierta: 'Abierta',
    en_evaluacion: 'En evaluación',
    cerrada: 'Cerrada'
  };

  readonly etiquetaPropuesta: Record<EstadoPropuesta, string> = {
    recibida: 'Recibida',
    seleccionada: 'Seleccionada',
    rechazada: 'Rechazada'
  };

  constructor(
    private servicios: ServiciosExternosService,
    private evaluacionService: EvaluacionService,
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit() {
    this.cargarDatos();
  }

  ngOnDestroy() {
    this.suscripciones.forEach((s) => s.unsubscribe());
  }

  get estadosPosibles(): EstadoSolicitud[] {
    return ['abierta', 'en_evaluacion', 'cerrada'];
  }

  get totalLicitaciones(): number {
    return this.solicitudes.length;
  }

  get totalAbiertas(): number {
    return this.solicitudes.filter((s) => s.estado === 'abierta').length;
  }

  get totalEnEvaluacion(): number {
    return this.solicitudes.filter((s) => s.estado === 'en_evaluacion').length;
  }

  get totalCerradas(): number {
    return this.solicitudes.filter((s) => s.estado === 'cerrada').length;
  }

  get solicitudesFiltradas(): SolicitudCotizacion[] {
    const q = this.filtroBusqueda.trim().toLowerCase();
    return this.solicitudes.filter((s) => {
      const okCategoria = !this.filtroCategoria || s.categoria_id === this.filtroCategoria;
      const okEstado = !this.filtroEstado || s.estado === this.filtroEstado;
      const okBusqueda = !q ||
        s.titulo.toLowerCase().includes(q) ||
        (s.descripcion && s.descripcion.toLowerCase().includes(q)) ||
        s.id.toLowerCase().includes(q);
      return okCategoria && okEstado && okBusqueda;
    });
  }

  onBuscar(e: Event) {
    this.filtroBusqueda = (e.target as HTMLInputElement).value;
  }

  codigoLicitacion(s: SolicitudCotizacion): string {
    if (!s) return 'LIC-2025-000';
    if (s.titulo.startsWith('LIC-')) {
      return s.titulo.split(':')[0].trim();
    }
    const short = s.id.startsWith('a0000000-0000-4000-8000-')
      ? s.id.slice(-3).toUpperCase()
      : s.id.slice(0, 3).toUpperCase();
    return `LIC-2025-${short}`;
  }

  propuestasDe(solicitudId: string): PropuestaCotizacion[] {
    return this.propuestasPorSolicitud.get(solicitudId) ?? [];
  }

  categoriaNombre(id: string): string {
    return this.categorias.find((c) => c.id === id)?.nombre ?? '—';
  }

  estaEvaluando(solicitudId: string): boolean {
    return this.evaluandoIds.has(solicitudId);
  }

  private cargarDatos() {
    // Carga paralela de catálogo y solicitudes (una sola petición gracias a la caché).
    this.suscripciones.push(
      forkJoin({
        categorias: this.servicios.listarCategorias(),
        solicitudes: this.servicios.listarSolicitudes()
      }).subscribe({
        next: (datos) => {
          this.categorias = datos.categorias;
          this.solicitudes = datos.solicitudes;
          this.cargando = false;
          datos.solicitudes.forEach((s) => this.cargarPropuestas(s.id));
        },
        error: () => {
          this.cargando = false;
        }
      })
    );
  }

  private cargarPropuestas(solicitudId: string) {
    this.suscripciones.push(
      this.servicios.listarPropuestas(solicitudId).subscribe((props) => {
        this.propuestasPorSolicitud.set(solicitudId, props);
      })
    );
  }

  recargar() {
    this.propuestasPorSolicitud.clear();
    this.servicios.limpiarCache();
    this.cargarDatos();
  }

  /** Inserta la licitación recién publicada al instante en la bandeja. */
  onLicitacionCreada(nueva: SolicitudCotizacion) {
    this.solicitudes = [nueva, ...this.solicitudes];
    this.cargarPropuestas(nueva.id);
  }

  /** Ejecuta el algoritmo multicriterio sobre las propuestas de una solicitud. */
  evaluarSolicitud(solicitud: SolicitudCotizacion) {
    const propuestas = this.propuestasDe(solicitud.id);
    if (propuestas.length < 2) {
      Swal.fire(
        'Evaluación',
        'Se necesitan al menos 2 propuestas recibidas para aplicar la evaluación multicriterio.',
        'info'
      );
      return;
    }

    this.evaluandoIds.add(solicitud.id);
    const evaluadas = this.evaluacionService.evaluarPropuestas(propuestas);
    const registros = this.evaluacionService.prepararRegistros(evaluadas);

    this.servicios.guardarEvaluaciones(registros).subscribe({
      next: () => {
        this.evaluandoIds.delete(solicitud.id);
        const ganadora = evaluadas[0];
        Swal.fire({
          icon: 'success',
          title: 'Evaluación completada',
          html: `Ranking generado para <b>${solicitud.titulo}</b>.<br>` +
            `Mejor opción: <b>${ganadora.propuesta.proveedor?.razon_social ?? '—'}</b>` +
            ` con <b>${ganadora.puntajeFinal.toFixed(2)}/100</b>.`,
          confirmButtonText: 'Ver detalle'
        }).then(() => {
          this.router.navigate(['/evaluacion'], { queryParams: { solicitud: solicitud.id } });
        });
      },
      error: () => {
        this.evaluandoIds.delete(solicitud.id);
        Swal.fire('Error', 'No se pudo guardar la evaluación. Inténtalo nuevamente.', 'error');
      }
    });
  }

  verExpediente(p: PropuestaCotizacion) {
    if (p.archivo_url && (p.archivo_url.startsWith('http') || p.archivo_url.startsWith('data:'))) {
      window.open(p.archivo_url, '_blank');
      return;
    }
    const monto = Number(p.monto_cotizado).toLocaleString('es-PE', { minimumFractionDigits: 2 });
    Swal.fire({
      title: `<span style="font-size:1.15rem;font-weight:700;color:#0f172a;">Expediente Técnico del Proveedor</span>`,
      html: `
        <div style="text-align:left;font-size:0.85rem;color:#334155;line-height:1.6;padding:0.25rem 0.5rem;">
          <p style="margin-bottom:0.4rem;"><b>Proveedor:</b> ${p.proveedor?.razon_social ?? '—'}</p>
          <p style="margin-bottom:0.4rem;"><b>RUC:</b> <span style="font-family:monospace;color:#2563eb;">${p.proveedor?.ruc ?? '—'}</span></p>
          <p style="margin-bottom:0.4rem;"><b>Contacto:</b> ${p.proveedor?.nombre_contacto ?? '—'} (${p.proveedor?.telefono ?? '—'})</p>
          <p style="margin-bottom:0.4rem;"><b>Monto Ofertado:</b> S/ ${monto} (Sin I.G.V.)</p>
          <p style="margin-bottom:0.4rem;"><b>Plazo de Ejecución:</b> ${p.tiempo_entrega_dias} días calendario</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:0.75rem 0;">
          <p style="margin-bottom:0.35rem;font-weight:600;color:#0f172a;">Resumen Ejecutivo Técnico:</p>
          <p style="background:#f8fafc;padding:0.65rem 0.85rem;border-radius:6px;border:1px solid #e2e8f0;font-size:0.82rem;color:#475569;margin-bottom:0.5rem;">
            ${p.propuesta_tecnica || 'Plan de trabajo técnico homologado según bases del pliego con repuestos originales y personal calificado.'}
          </p>
          <p style="margin-top:0.5rem;color:#64748b;font-size:0.78rem;">
            Documento adjunto: <b>${p.archivo_url || 'Expediente_Tecnico_Digital.pdf'}</b>
          </p>
        </div>
      `,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#2563eb'
    });
  }

  exportarReporte() {
    if (!this.solicitudes.length) {
      Swal.fire('Atención', 'No hay licitaciones para exportar.', 'info');
      return;
    }

    const separador = ';';
    const BOM = '\uFEFF';
    const cabeceras = [
      'Código Licitación',
      'Título de la Convocatoria',
      'Categoría de Servicio',
      'Presupuesto Referencial (S/)',
      'Fecha Límite',
      'Estado',
      'Propuestas Recibidas',
      'Fecha de Registro'
    ];

    const filas = this.solicitudes.map((sol) => {
      const propuestas = this.propuestasPorSolicitud.get(sol.id) ?? [];
      const cat = sol.categoria?.nombre || this.categorias.find((c) => c.id === sol.categoria_id)?.nombre || 'General';
      const ppto = Number(sol.presupuesto_referencial || 0).toFixed(2);
      const est = this.etiquetaEstado[sol.estado] || sol.estado;

      return [
        `"LIC-${sol.id.slice(0, 8).toUpperCase()}"`,
        `"${(sol.titulo || '').replace(/"/g, '""')}"`,
        `"${cat.replace(/"/g, '""')}"`,
        ppto,
        sol.fecha_limite || '—',
        est,
        propuestas.length,
        sol.created_at ? new Date(sol.created_at).toLocaleDateString('es-PE') : '—'
      ];
    });

    const csvContent = BOM + [
      cabeceras.join(separador),
      ...filas.map((f) => f.join(separador))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Reporte_Licitaciones_GrandMarina_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    Swal.fire({
      icon: 'success',
      title: 'Reporte exportado',
      text: 'Se descargó el consolidado de licitaciones y cotizaciones para Excel.',
      timer: 1800,
      showConfirmButton: false
    });
  }

  get usuarioActual(): User | null {
    return this.auth.usuarioActual;
  }

  get nombreUsuario(): string {
    const u = this.usuarioActual;
    if (!u) return 'Valeria Soto';
    const meta = u.user_metadata;
    if (meta && typeof meta['nombre'] === 'string' && meta['nombre'].trim()) {
      return meta['nombre'].trim();
    }
    if (meta && typeof meta['full_name'] === 'string' && meta['full_name'].trim()) {
      return meta['full_name'].trim();
    }
    if (meta && typeof meta['name'] === 'string' && meta['name'].trim()) {
      return meta['name'].trim();
    }
    if (u.email) {
      const alias = u.email.split('@')[0];
      return alias
        .split(/[._-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return 'Valeria Soto';
  }

  get rolUsuario(): string {
    const u = this.usuarioActual;
    if (!u) return 'Jefa de Compras & Licitaciones';
    const meta = u.user_metadata;
    if (meta && typeof meta['rol'] === 'string' && meta['rol'].trim()) {
      return meta['rol'].trim();
    }
    if (meta && typeof meta['cargo'] === 'string' && meta['cargo'].trim()) {
      return meta['cargo'].trim();
    }
    return 'Jefa de Compras & Licitaciones';
  }

  get inicialesUsuario(): string {
    const nombre = this.nombreUsuario.trim();
    if (!nombre) return 'VS';
    const palabras = nombre.split(/\s+/).filter(Boolean);
    if (palabras.length >= 2) {
      return (palabras[0][0] + palabras[1][0]).toUpperCase();
    }
    return nombre.slice(0, 2).toUpperCase();
  }

  verPerfil() {
    const u = this.usuarioActual;
    const correo = u?.email ?? 'valeria.soto@grandmarina.pe';
    const id = u?.id ? u.id.slice(0, 8) + '…' : 'USR-CORP-441';

    Swal.fire({
      title: 'Perfil de Usuario',
      html: `
        <div style="text-align: left; padding: 6px 0; font-size: 13.5px; color: #1e293b;">
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #2563eb; color: #fff; font-weight: 700; font-size: 18px; display: flex; align-items: center; justify-content: center;">
              ${this.inicialesUsuario}
            </div>
            <div>
              <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${this.nombreUsuario}</div>
              <div style="color: #2563eb; font-weight: 600; font-size: 12.5px;">${this.rolUsuario}</div>
            </div>
          </div>
          <div style="display: grid; gap: 8px; font-size: 13px;">
            <div><strong style="color: #64748b;">Correo institucional:</strong> <span style="color: #0f172a;">${correo}</span></div>
            <div><strong style="color: #64748b;">Organización:</strong> <span style="color: #0f172a;">Grand Marina Resort &amp; Convention Center</span></div>
            <div><strong style="color: #64748b;">Área:</strong> <span style="color: #0f172a;">Dirección de Compras, Licitaciones y Servicios</span></div>
            <div><strong style="color: #64748b;">ID de Sesión:</strong> <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11.5px; color: #475569;">${id}</code></div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Cerrar Sesión',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cerrar',
      cancelButtonColor: '#64748b'
    }).then((res) => {
      if (res.isConfirmed) {
        this.cerrarSesion();
      }
    });
  }

  cerrarSesion() {
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: 'Se finalizará tu sesión en el sistema de adquisiciones corporativas.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b'
    }).then((res) => {
      if (res.isConfirmed) {
        this.auth.cerrarSesion().then(() => {
          Swal.fire({
            icon: 'success',
            title: 'Sesión finalizada',
            text: 'Has cerrado sesión exitosamente.',
            timer: 1200,
            showConfirmButton: false
          }).then(() => {
            this.router.navigate(['/login']);
          });
        });
      }
    });
  }
}