import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import type { User } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { ServiciosExternosService } from '../../services/servicios-externos.service';
import { EvaluacionService, PropuestaEvaluada } from '../../services/evaluacion.service';
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
  @ViewChild('nueva') nuevaModal?: NuevaLicitacionComponent;
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
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarDatos();
    this.suscripciones.push(
      this.evaluacionService.cambioPesos$.subscribe(() => {
        this.recalcularTodosLosRankings();
      })
    );
  }

  private recalcularTodosLosRankings() {
    this.propuestasPorSolicitud.forEach((props, solId) => {
      const sol = this.solicitudes.find((s) => s.id === solId);
      // Blindaje de adjudicadas: no alterar licitaciones ya cerradas o adjudicadas
      if (sol?.estado === 'cerrada') return;

      if (props.length > 0) {
        try {
          const pesos = (sol?.pesos_ahp && typeof sol.pesos_ahp === 'object')
            ? sol.pesos_ahp
            : this.evaluacionService.getPesosDeCategoria(sol?.categoria_id);
          const ranking = this.evaluacionService.evaluarPropuestas(props, pesos);
          this.rankingPorSolicitud.set(solId, ranking);
        } catch (e) {
          console.warn('Recálculo de ranking:', e);
        }
      }
    });
    this.cdr.markForCheck();
    this.cdr.detectChanges();
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
    return this.solicitudes.filter((s) => s?.estado === 'abierta').length;
  }

  get totalEnEvaluacion(): number {
    return this.solicitudes.filter((s) => s?.estado === 'en_evaluacion').length;
  }

  get totalCerradas(): number {
    return this.solicitudes.filter((s) => s?.estado === 'cerrada').length;
  }

  get solicitudesFiltradas(): SolicitudCotizacion[] {
    const q = this.filtroBusqueda.trim().toLowerCase();
    return this.solicitudes.filter((s) => {
      if (!s || !s.id || !s.titulo || s.titulo.trim().length === 0) return false;
      const okCategoria = !this.filtroCategoria || s.categoria_id === this.filtroCategoria;
      const okEstado = !this.filtroEstado || s.estado === this.filtroEstado;
      const okBusqueda = !q ||
        (s.titulo && s.titulo.toLowerCase().includes(q)) ||
        (s.descripcion && s.descripcion.toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase().includes(q));
      return okCategoria && okEstado && okBusqueda;
    });
  }

  onBuscar(e: Event) {
    this.filtroBusqueda = (e.target as HTMLInputElement).value;
  }

  codigoLicitacion(s: SolicitudCotizacion): string {
    if (!s || !s.id) return 'LIC-2025-000';
    const titulo = s.titulo || '';
    if (titulo.startsWith('LIC-')) {
      return titulo.split(':')[0].trim();
    }
    const short = s.id.startsWith('a0000000-0000-4000-8000-')
      ? s.id.slice(-3).toUpperCase()
      : s.id.slice(0, 3).toUpperCase();
    return `LIC-2025-${short}`;
  }

  propuestasDe(solicitudId: string): PropuestaCotizacion[] {
    const list = this.propuestasPorSolicitud.get(solicitudId) ?? [];
    if (!list.length) return [];
    const ranking = this.rankingPorSolicitud.get(solicitudId);
    const sol = this.solicitudes.find((s) => s.id === solicitudId);

    // Identificar ganador directamente desde la lista en memoria (evita recursión infinita)
    let ganadorId: string | undefined;
    if (sol?.estado === 'cerrada') {
      const seleccionada = list.find((p) => p.estado === 'seleccionada');
      if (seleccionada) {
        ganadorId = seleccionada.id;
      } else if (ranking && ranking.length > 0) {
        ganadorId = ranking[0].propuesta.id;
      } else if (list.length > 0) {
        ganadorId = list[0].id;
      }
    }

    return [...list].sort((a, b) => {
      if (ganadorId) {
        const aWin = a.id === ganadorId;
        const bWin = b.id === ganadorId;
        if (aWin && !bWin) return -1;
        if (!aWin && bWin) return 1;
      }
      const scoreA = ranking?.find((r) => r.propuesta.id === a.id)?.puntajeFinal ?? 0;
      const scoreB = ranking?.find((r) => r.propuesta.id === b.id)?.puntajeFinal ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (Number(a.monto_cotizado) || 0) - (Number(b.monto_cotizado) || 0);
    });
  }

  esTop1(p: PropuestaCotizacion, sol: SolicitudCotizacion): boolean {
    if (sol.estado === 'cerrada') {
      return false; // En licitación cerrada solo el ganador lleva el badge "Adjudicado"
    }
    const ranking = this.rankingPorSolicitud.get(sol.id);
    if (ranking && ranking.length > 0) {
      return ranking[0].propuesta.id === p.id;
    }
    return false;
  }

  categoriaNombre(id: string): string {
    return this.categorias.find((c) => c.id === id)?.nombre ?? '—';
  }

  estaEvaluando(solicitudId: string): boolean {
    return this.evaluandoIds.has(solicitudId);
  }

  private cargarDatos() {
    // Carga paralela de catálogo, solicitudes y propuestas para renderizado síncrono
    this.suscripciones.push(
      forkJoin({
        categorias: this.servicios.listarCategorias(),
        solicitudes: this.servicios.listarSolicitudes(),
        propuestas: this.servicios.listarPropuestas()
      }).subscribe({
        next: (datos) => {
          this.categorias = datos.categorias;
          this.solicitudes = datos.solicitudes;

          // Agrupar propuestas por solicitud_id de inmediato
          const mapaProps = new Map<string, PropuestaCotizacion[]>();
          datos.propuestas.forEach((p) => {
            const arr = mapaProps.get(p.solicitud_id) ?? [];
            arr.push(p);
            mapaProps.set(p.solicitud_id, arr);
          });
          this.propuestasPorSolicitud = mapaProps;

          // Precomputar rankings con pesos adaptativos por categoría o bases congeladas
          mapaProps.forEach((props, solId) => {
            if (props.length > 0) {
              try {
                const sol = this.solicitudes.find((s) => s.id === solId);
                const pesos = (sol?.pesos_ahp && typeof sol.pesos_ahp === 'object')
                  ? sol.pesos_ahp
                  : this.evaluacionService.getPesosDeCategoria(sol?.categoria_id);
                const ranking = this.evaluacionService.evaluarPropuestas(props, pesos);
                this.rankingPorSolicitud.set(solId, ranking);
              } catch (e) {
                console.warn('Evaluación preliminar de propuestas:', e);
              }
            }
          });

          this.cargando = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        },
        error: () => {
          this.cargando = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        }
      })
    );
  }

  rankingPorSolicitud = new Map<string, PropuestaEvaluada[]>();

  private cargarPropuestas(solicitudId: string) {
    this.suscripciones.push(
      this.servicios.listarPropuestas(solicitudId).subscribe((props) => {
        this.propuestasPorSolicitud.set(solicitudId, props);
        if (props.length > 0) {
          try {
            const catId = this.solicitudes.find((s) => s.id === solicitudId)?.categoria_id;
            const pesos = this.evaluacionService.getPesosDeCategoria(catId);
            const ranking = this.evaluacionService.evaluarPropuestas(props, pesos);
            this.rankingPorSolicitud.set(solicitudId, ranking);
          } catch (e) {
            console.warn('Evaluación preliminar de propuestas:', e);
          }
        }
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      })
    );
  }

  obtenerEvaluacion(solicitudId: string, propuestaId: string): PropuestaEvaluada | undefined {
    const ranking = this.rankingPorSolicitud.get(solicitudId);
    return ranking?.find((r) => r.propuesta.id === propuestaId);
  }

  proveedorGanador(sol: SolicitudCotizacion): PropuestaCotizacion | undefined {
    const props = this.propuestasPorSolicitud.get(sol.id) ?? [];
    if (!props.length) return undefined;
    const seleccionada = props.find((p) => p.estado === 'seleccionada');
    if (seleccionada) return seleccionada;
    const ranking = this.rankingPorSolicitud.get(sol.id);
    if (ranking && ranking.length > 0) {
      return ranking[0].propuesta;
    }
    return props[0];
  }

  esGanador(p: PropuestaCotizacion, sol: SolicitudCotizacion): boolean {
    if (p.estado === 'seleccionada') return true;
    if (sol.estado === 'cerrada') {
      const ganador = this.proveedorGanador(sol);
      return ganador?.id === p.id;
    }
    return false;
  }

  auditoriaTexto(p: PropuestaCotizacion, sol: SolicitudCotizacion): string {
    const ev = this.obtenerEvaluacion(sol.id, p.id);
    const puntaje = ev ? `${ev.puntajeFinal.toFixed(0)}/100` : '';

    if (sol.estado === 'cerrada') {
      if (this.esGanador(p, sol)) {
        return puntaje ? `Adjudicado ${puntaje}` : 'Adjudicado';
      }
      return 'Rechazado';
    }

    if (sol.estado === 'en_evaluacion') {
      return puntaje ? `En Evaluación (${puntaje})` : 'En Evaluación';
    }

    return 'Propuesta Recibida';
  }

  auditoriaTipo(p: PropuestaCotizacion, sol: SolicitudCotizacion): 'verde' | 'ambar' | 'rojo' {
    if (sol.estado === 'cerrada') {
      return this.esGanador(p, sol) ? 'verde' : 'rojo';
    }
    if (sol.estado === 'en_evaluacion') {
      return 'ambar';
    }
    return 'ambar';
  }

  abrirNuevaLicitacion() {
    this.nuevaModal?.abrir();
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  recargar() {
    this.cargando = true;
    this.propuestasPorSolicitud.clear();
    this.rankingPorSolicitud.clear();
    this.servicios.limpiarCache();
    this.cargarDatos();
    this.cdr.markForCheck();
  }

  /** Inserta la licitación recién publicada al instante en la bandeja. */
  onLicitacionCreada(nueva: SolicitudCotizacion) {
    this.solicitudes = [nueva, ...this.solicitudes];
    this.cargarPropuestas(nueva.id);
    this.cdr.markForCheck();
    this.cdr.detectChanges();
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
    const monto = Number(p.monto_cotizado).toLocaleString('es-PE', { minimumFractionDigits: 2 });
    const nombreDoc = (p.archivo_url && !p.archivo_url.startsWith('data:'))
      ? p.archivo_url.split('/').pop() || 'Expediente_Tecnico_Digital.pdf'
      : (p.archivo_url?.startsWith('data:') ? 'Documento_Adjunto_Postor.pdf' : 'Expediente_Tecnico_Digital.pdf');

    Swal.fire({
      title: `<span style="font-size:1.15rem;font-weight:700;color:#0f172a;">Expediente Técnico del Proveedor</span>`,
      html: `
        <div style="text-align:left;font-size:0.85rem;color:#334155;line-height:1.6;padding:0.25rem 0.5rem;">
          <p style="margin-bottom:0.4rem;"><b>Proveedor:</b> ${p.proveedor?.razon_social ?? '—'}</p>
          <p style="margin-bottom:0.4rem;"><b>RUC:</b> <span style="font-family:monospace;color:#2563eb;">${p.proveedor?.ruc ?? '—'}</span></p>
          <p style="margin-bottom:0.4rem;"><b>Contacto:</b> ${p.proveedor?.nombre_contacto ?? '—'} (${p.proveedor?.telefono ?? '—'})</p>
          <p style="margin-bottom:0.4rem;"><b>Email:</b> ${p.proveedor?.email ?? '—'}</p>
          <p style="margin-bottom:0.4rem;"><b>Monto Ofertado:</b> S/ ${monto} (Sin I.G.V.)</p>
          <p style="margin-bottom:0.4rem;"><b>Plazo de Ejecución:</b> ${p.tiempo_entrega_dias} días calendario</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:0.75rem 0;">
          <p style="margin-bottom:0.35rem;font-weight:600;color:#0f172a;">Resumen Ejecutivo Técnico:</p>
          <p style="background:#f8fafc;padding:0.65rem 0.85rem;border-radius:6px;border:1px solid #e2e8f0;font-size:0.82rem;color:#475569;margin-bottom:0.5rem;">
            ${p.propuesta_tecnica || 'Plan de trabajo técnico homologado según bases del pliego con repuestos originales y personal calificado.'}
          </p>
          <div style="margin-top:0.75rem;padding:0.6rem 0.8rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:#1e40af;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>Archivo adjunto: <b>${nombreDoc}</b></span>
            </div>
            <button id="btn-ver-adjunto" type="button" style="background:#2563eb;color:#ffffff;border:none;border-radius:4px;padding:5px 12px;font-size:0.75rem;font-weight:600;cursor:pointer;">
              Ver archivo adjunto
            </button>
          </div>
        </div>
      `,
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Abrir Documento Adjunto',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const btn = document.getElementById('btn-ver-adjunto');
        if (btn) {
          btn.addEventListener('click', () => {
            Swal.close();
            this.visualizarArchivoAdjunto(p);
          });
        }
      }
    }).then((res) => {
      if (res.isConfirmed) {
        this.visualizarArchivoAdjunto(p);
      }
    });
  }

  visualizarArchivoAdjunto(p: PropuestaCotizacion) {
    const razon = p.proveedor?.razon_social ?? 'Proveedor';

    if (p.archivo_url && (p.archivo_url.startsWith('data:') || p.archivo_url.startsWith('http'))) {
      Swal.fire({
        title: `Documento Técnico: ${razon}`,
        html: `
          <div style="width: 100%; height: 500px; max-height: 70vh; margin-top: 10px;">
            <iframe src="${p.archivo_url}" style="width: 100%; height: 100%; border: 1px solid #cbd5e1; border-radius: 8px;"></iframe>
          </div>
        `,
        width: '800px',
        confirmButtonText: 'Cerrar Visor',
        confirmButtonColor: '#2563eb'
      });
      return;
    }

    Swal.fire({
      icon: 'info',
      title: 'Sin documento adjunto',
      text: `El postor "${razon}" no cuenta con un archivo PDF adjunto en este registro previo de pruebas.`,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#2563eb'
    });
  }

  detenerPostulaciones(sol: SolicitudCotizacion) {
    if (sol.estado === 'cerrada') return;

    Swal.fire({
      title: '¿Detener postulaciones?',
      text: `Se cerrará la recepción pública de propuestas para "${sol.titulo}" y pasará a Mesa de Evaluación.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, pasar a evaluación',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb'
    }).then((res) => {
      if (res.isConfirmed) {
        this.servicios.cambiarEstadoSolicitud(sol.id, 'en_evaluacion').subscribe({
          next: () => {
            sol.estado = 'en_evaluacion';
            Swal.fire({
              icon: 'success',
              title: 'Recepción detenida',
              text: 'La licitación ahora se encuentra en evaluación técnica.',
              timer: 1500,
              showConfirmButton: false
            });
          },
          error: () => {
            Swal.fire('Error', 'No se pudo actualizar el estado de la licitación.', 'error');
          }
        });
      }
    });
  }

  reanudarPostulaciones(sol: SolicitudCotizacion) {
    if (sol.estado === 'cerrada') return;

    Swal.fire({
      title: '¿Reanudar postulaciones?',
      text: `La licitación "${sol.titulo}" volverá a estar abierta en el portal público para recibir propuestas.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, reanudar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a'
    }).then((res) => {
      if (res.isConfirmed) {
        this.servicios.cambiarEstadoSolicitud(sol.id, 'abierta').subscribe({
          next: () => {
            sol.estado = 'abierta';
            Swal.fire({
              icon: 'success',
              title: 'Convocatoria reanudada',
              text: 'La licitación vuelve a aceptar postulaciones de proveedores.',
              timer: 1500,
              showConfirmButton: false
            });
          },
          error: () => {
            Swal.fire('Error', 'No se pudo reanudar la licitación.', 'error');
          }
        });
      }
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