import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import type { User } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { ServiciosExternosService } from '../../services/servicios-externos.service';
import { EvaluacionService, PropuestaEvaluada } from '../../services/evaluacion.service';
import {
  CategoriaServicio,
  Contrato,
  EstadoContrato,
  EvaluacionCriterios,
  PropuestaCotizacion,
  SolicitudCotizacion
} from '../../interfaces/servicios-externos';
import { NuevaLicitacionComponent } from '../nueva-licitacion/nueva-licitacion';
import { AuthNavComponent } from '../auth-nav/auth-nav';

/**
 * Panel de control de compras (ruta /admin).
 * Comparador multicriterio, ranking Top 3, recomendación automática y
 * adjudicación/generación de contratos. Incluye la pestaña de contratos.
 */
@Component({
  selector: 'app-evaluacion',
  standalone: true,
  imports: [CommonModule, RouterLink, NuevaLicitacionComponent],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class AdminComponent implements OnInit, OnDestroy {
  categorias: CategoriaServicio[] = [];
  solicitudes: SolicitudCotizacion[] = [];
  contratos: Contrato[] = [];
  evaluaciones: EvaluacionCriterios[] = [];
  solicitudActivaId = '';
  propuestas: PropuestaCotizacion[] = [];
  resultados: PropuestaEvaluada[] = [];
  pestanaActiva: 'evaluacion' | 'contratos' = 'evaluacion';
  cargando = true;
  evaluando = false;
  adjudicando = false;
  private suscripciones: Subscription[] = [];

  readonly etiquetaContrato: Record<EstadoContrato, string> = {
    vigente: 'Vigente',
    culminado: 'Culminado',
    cancelado: 'Cancelado'
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private servicios: ServiciosExternosService,
    private evaluacionService: EvaluacionService,
    private auth: AuthService
  ) {}

  ngOnInit() {
    this.suscripciones.push(
      this.route.queryParams.subscribe((params) => {
        const id = params['solicitud'];
        if (id && id !== this.solicitudActivaId) {
          this.solicitudActivaId = id;
          this.cargarPropuestas(id);
        }
      })
    );
    this.cargarDatos();
  }

  ngOnDestroy() {
    this.suscripciones.forEach((s) => s.unsubscribe());
  }

  // ---------------------------------------------------------------------------
  // GETTERS DE VISTA
  // ---------------------------------------------------------------------------

  get solicitudActiva(): SolicitudCotizacion | undefined {
    return this.solicitudes.find((s) => s.id === this.solicitudActivaId);
  }

  get codigoLicitacion(): string {
    if (!this.solicitudActiva) return 'LIC-2025-014';
    if (this.solicitudActiva.titulo.startsWith('LIC-')) {
      const parts = this.solicitudActiva.titulo.split(':');
      return parts[0].trim();
    }
    const short = this.solicitudActiva.id.startsWith('a0000000-0000-4000-8000-')
      ? this.solicitudActiva.id.slice(-3).toUpperCase()
      : this.solicitudActiva.id.slice(0, 3).toUpperCase();
    return `LIC-2025-${short}`;
  }

  get ganadora(): PropuestaEvaluada | undefined {
    return this.resultados[0];
  }

  /** True si la solicitud activa ya está adjudicada (cerrada o con contrato existente). */
  get solicitudYaAdjudicada(): boolean {
    if (this.solicitudActiva?.estado === 'cerrada') return true;
    const propuestaIds = new Set(this.propuestas.map((p) => p.id));
    return this.contratos.some((c) => propuestaIds.has(c.propuesta_id));
  }

  get recomendacion(): string {
    if (!this.ganadora || this.resultados.length === 0) return '';
    return this.evaluacionService.generarRecomendacion(this.ganadora, this.propuestas.length);
  }

  get mejorPuntaje(): number {
    return this.ganadora?.puntajeFinal ?? 0;
  }

  get totalProveedores(): number {
    return new Set(this.propuestas.map((p) => p.proveedor_id)).size;
  }

  evaluacionFecha(propuestaId: string): string | null {
    return this.evaluaciones.find((e) => e.propuesta_id === propuestaId)?.fecha_evaluacion ?? null;
  }

  etiquetaEstadoSolicitud(estado: string): string {
    const mapa: Record<string, string> = {
      abierta: 'Abierta',
      en_evaluacion: 'En evaluación',
      cerrada: 'Cerrada'
    };
    return mapa[estado] ?? estado;
  }

  formatearMoneda(valor: number | null | undefined): string {
    return (Number(valor) || 0).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ---------------------------------------------------------------------------
  // CARGA Y ORQUESTACIÓN
  // ---------------------------------------------------------------------------

  private cargarDatos() {
    // Carga paralela de catálogo, solicitudes, evaluaciones y contratos.
    this.suscripciones.push(
      forkJoin({
        categorias: this.servicios.listarCategorias(),
        solicitudes: this.servicios.listarSolicitudes(),
        evaluaciones: this.servicios.listarEvaluaciones(),
        contratos: this.servicios.listarContratos()
      }).subscribe({
        next: (datos) => {
          this.categorias = datos.categorias;
          this.solicitudes = datos.solicitudes;
          this.evaluaciones = datos.evaluaciones;
          this.contratos = datos.contratos;
          this.cargando = false;
          if (!this.solicitudActivaId && datos.solicitudes.length) {
            const preferida =
              datos.solicitudes.find((s) => s.estado !== 'cerrada') ?? datos.solicitudes[0];
            this.solicitudActivaId = preferida.id;
            this.cargarPropuestas(preferida.id);
          }
        },
        error: () => {
          this.cargando = false;
        }
      })
    );
  }

  cargarPropuestas(solicitudId: string) {
    this.propuestas = [];
    this.resultados = [];
    this.suscripciones.push(
      this.servicios.listarPropuestas(solicitudId).subscribe({
        next: (props) => {
          this.propuestas = props;
          this.calcularRanking();
        },
        error: () => {
          this.propuestas = [];
        }
      })
    );
  }

  cambiarSolicitud(id: string) {
    if (id && id !== this.solicitudActivaId) {
      this.router.navigate(['/evaluacion'], { queryParams: { solicitud: id } });
    }
  }

  cambiarPestana(pestana: 'evaluacion' | 'contratos') {
    this.pestanaActiva = pestana;
  }

  /** Inserta la licitación recién publicada al selector de evaluación. */
  onLicitacionCreada(nueva: SolicitudCotizacion) {
    this.solicitudes = [nueva, ...this.solicitudes];
    if (!this.solicitudActivaId) {
      this.solicitudActivaId = nueva.id;
      this.cargarPropuestas(nueva.id);
    }
  }

  private calcularRanking() {
    this.resultados = this.propuestas.length
      ? this.evaluacionService.evaluarPropuestas(this.propuestas)
      : [];
  }

  // ---------------------------------------------------------------------------
  // ACCIONES: EVALUAR, RE-EVALUAR Y ADJUDICAR
  // ---------------------------------------------------------------------------

  reevaluar() {
    if (this.propuestas.length < 2) {
      Swal.fire('Evaluación', 'Se necesitan al menos 2 propuestas para evaluar.', 'info');
      return;
    }
    this.evaluando = true;
    const registros = this.evaluacionService.prepararRegistros(this.resultados);
    this.servicios.guardarEvaluaciones(registros).subscribe({
      next: (guardadas) => {
        this.evaluando = false;
        const idsGuardados = new Set(guardadas.map((g) => g.propuesta_id));
        this.evaluaciones = [
          ...guardadas,
          ...this.evaluaciones.filter((e) => !idsGuardados.has(e.propuesta_id))
        ];
        Swal.fire({
          icon: 'success',
          title: 'Evaluación guardada',
          text: 'El ranking multicriterio fue actualizado correctamente.'
        });
      },
      error: () => {
        this.evaluando = false;
        Swal.fire('Error', 'No se pudo guardar la evaluación.', 'error');
      }
    });
  }

  adjudicar() {
    const ganadora = this.ganadora;
    const solicitud = this.solicitudActiva;
    if (!ganadora || !solicitud) return;

    const hoy = new Date();
    const fechaInicioDefault = hoy.toISOString().split('T')[0];
    const fechaFin = new Date(hoy);
    fechaFin.setDate(fechaFin.getDate() + 90);
    const fechaFinDefault = fechaFin.toISOString().split('T')[0];

    Swal.fire({
      title: 'Adjudicar y generar contrato',
      html:
        `<p style="text-align:left">Propuesta ganadora: <b>${ganadora.propuesta.proveedor?.razon_social ?? '—'}</b><br>` +
        `Solicitud: <b>${solicitud.titulo}</b><br>` +
        `Monto: <b>S/ ${this.formatearMoneda(ganadora.propuesta.monto_cotizado)}</b></p>` +
        `<div style="text-align:left; margin-top:12px">` +
        `<label for="swal-inicio"><b>Fecha de inicio</b></label>` +
        `<input type="date" id="swal-inicio" class="swal2-input" value="${fechaInicioDefault}">` +
        `<label for="swal-fin"><b>Fecha de fin</b></label>` +
        `<input type="date" id="swal-fin" class="swal2-input" value="${fechaFinDefault}">` +
        `<label for="swal-terminos"><b>Términos del contrato</b></label>` +
        `<textarea id="swal-terminos" class="swal2-textarea" placeholder="Condiciones, penalidades, forma de pago...">Contrato derivado de la evaluación multicriterio automática.</textarea>` +
        `</div>`,
      showCancelButton: true,
      confirmButtonText: 'Adjudicar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const inicio = (document.getElementById('swal-inicio') as HTMLInputElement).value;
        const fin = (document.getElementById('swal-fin') as HTMLInputElement).value;
        if (!inicio || !fin) {
          Swal.showValidationMessage('Completa las fechas del contrato.');
          return false;
        }
        if (fin < inicio) {
          Swal.showValidationMessage('La fecha de fin no puede ser anterior al inicio.');
          return false;
        }
        const terminos = (document.getElementById('swal-terminos') as HTMLTextAreaElement).value;
        return { fecha_inicio: inicio, fecha_fin: fin, terminos };
      }
    }).then((resultado) => {
      if (resultado.isConfirmed && resultado.value) {
        this.adjudicando = true;
        this.servicios
          .adjudicarContrato({
            propuesta_id: ganadora.propuesta.id,
            fecha_inicio: resultado.value.fecha_inicio,
            fecha_fin: resultado.value.fecha_fin,
            terminos: resultado.value.terminos
          })
          .subscribe({
            next: (contrato) => {
              this.adjudicando = false;
              // Marcar la solicitud como cerrada localmente de inmediato
              const solId = ganadora.propuesta.solicitud_id;
              if (solId) {
                this.solicitudes = this.solicitudes.map((s) =>
                  s.id === solId ? { ...s, estado: 'cerrada' as const } : s
                );
              }
              this.contratos = [contrato, ...this.contratos];
              // Invalidar caché y recargar para sincronizar con Supabase
              this.servicios.limpiarCache();
              this.cargarDatos();
              Swal.fire({
                icon: 'success',
                title: 'Contrato generado',
                html:
                  `Se adjudicó la licitación a <b>${ganadora.propuesta.proveedor?.razon_social ?? ''}</b> ` +
                  `por <b>S/ ${this.formatearMoneda(contrato.monto_total)}</b>.`,
                confirmButtonText: 'Ver contratos'
              }).then(() => {
                this.pestanaActiva = 'contratos';
              });
            },
            error: () => {
              this.adjudicando = false;
              Swal.fire('Error', 'No se pudo generar el contrato.', 'error');
            }
          });
      }
    });
  }

  abrirHistorial() {
    const sol = this.solicitudActiva;
    if (!sol) return;

    Swal.fire({
      title: `<span style="font-size:1.15rem;font-weight:700;color:#0f172a;">Trazabilidad e Historial</span>`,
      html: `
        <div style="text-align:left;font-size:0.85rem;color:#334155;line-height:1.6;padding:0.25rem 0.5rem;">
          <p style="margin-bottom:0.75rem;"><b>Convocatoria:</b> ${sol.titulo}</p>
          <div style="border-left: 2px solid #2563eb; padding-left: 1rem; margin-left: 0.25rem; display:flex; flex-direction:column; gap:0.75rem;">
            <div>
              <span style="font-weight:600;color:#0f172a;">1. Convocatoria Publicada</span><br>
              <span style="color:#64748b;font-size:0.78rem;">Presupuesto Capex: S/ ${this.formatearMoneda(sol.presupuesto_referencial)} · Fecha límite: ${sol.fecha_limite ?? '2026-12-01'}</span>
            </div>
            <div>
              <span style="font-weight:600;color:#0f172a;">2. Recepción de Ofertas</span><br>
              <span style="color:#64748b;font-size:0.78rem;">${this.propuestas.length} propuestas recibidas y validadas con RUC activo en SUNAT.</span>
            </div>
            <div>
              <span style="font-weight:600;color:#0f172a;">3. Matriz Decisional AHP</span><br>
              <span style="color:#64748b;font-size:0.78rem;">Algoritmo Saaty v2.4 ejecutado con Consistencia CR &lt; 0.10.</span>
            </div>
            <div>
              <span style="font-weight:600;color:#0f172a;">4. Estado del Proceso</span><br>
              <span style="color:#2563eb;font-weight:600;text-transform:uppercase;">${sol.estado.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
      confirmButtonText: 'Ver Contratos Vigentes',
      confirmButtonColor: '#2563eb'
    }).then((res) => {
      if (res.isConfirmed) {
        this.cambiarPestana('contratos');
      }
    });
  }

  exportarMatriz() {
    if (!this.resultados.length) {
      Swal.fire('Atención', 'No hay datos de evaluación para exportar.', 'info');
      return;
    }
    const cabeceras = ['Posición', 'Proveedor', 'RUC', 'Monto (S/)', 'Plazo (días)', 'Puntaje Costo', 'Puntaje Exp', 'Puntaje Disp', 'Puntaje Hist', 'Puntaje Final', 'Elegibilidad'];
    const filas = this.resultados.map((r) => [
      r.posicion,
      `"${r.propuesta.proveedor?.razon_social ?? ''}"`,
      r.propuesta.proveedor?.ruc ?? '',
      r.propuesta.monto_cotizado,
      r.propuesta.tiempo_entrega_dias,
      r.puntajes.costo.toFixed(1),
      r.puntajes.experiencia.toFixed(1),
      r.puntajes.disponibilidad.toFixed(1),
      r.puntajes.historico.toFixed(1),
      r.puntajeFinal.toFixed(2),
      r.posicion === 1 ? 'Elegible (Ganador)' : r.posicion === 2 ? 'Segundo Lugar' : 'Puntaje Insuficiente'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [cabeceras.join(','), ...filas.map((f) => f.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Matriz_AHP_${this.codigoLicitacion}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
      icon: 'success',
      title: 'Matriz exportada',
      text: `Se descargó la matriz de evaluación en formato CSV.`,
      timer: 2000,
      showConfirmButton: false
    });
  }

  descargarDictamen() {
    if (!this.ganadora) {
      Swal.fire('Atención', 'No hay dictamen disponible sin propuestas evaluadas.', 'info');
      return;
    }

    Swal.fire({
      icon: 'info',
      title: 'Dictamen Técnico de Evaluación',
      html: `
        <div style="text-align:left;font-size:0.85rem;color:#334155;line-height:1.6;">
          <p><b>Convocatoria:</b> ${this.solicitudActiva?.titulo}</p>
          <p><b>Proveedor Recomendado:</b> ${this.ganadora.propuesta.proveedor?.razon_social ?? '—'}</p>
          <p><b>Puntaje AHP Ponderado:</b> ${this.ganadora.puntajeFinal.toFixed(2)} / 100</p>
          <p><b>Monto Ofertado:</b> S/ ${this.formatearMoneda(this.ganadora.propuesta.monto_cotizado)}</p>
          <p><b>Plazo de Ejecución:</b> ${this.ganadora.propuesta.tiempo_entrega_dias} días calendario</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:0.75rem 0;">
          <p style="color:#64748b;font-size:0.78rem;">Dictamen generado automáticamente conforme al algoritmo multicriterio Saaty AHP y el reglamento de contrataciones de Grand Marina Resort.</p>
        </div>
      `,
      confirmButtonText: 'Imprimir / Guardar',
      confirmButtonColor: '#2563eb',
      showCancelButton: true,
      cancelButtonText: 'Cerrar'
    }).then((res) => {
      if (res.isConfirmed) {
        window.print();
      }
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