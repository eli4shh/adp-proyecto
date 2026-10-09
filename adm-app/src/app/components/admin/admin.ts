import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
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
  imports: [CommonModule, RouterLink, RouterLinkActive, NuevaLicitacionComponent, AuthNavComponent],
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
    private evaluacionService: EvaluacionService
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
}