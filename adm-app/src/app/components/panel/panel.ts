import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
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
  imports: [CommonModule, RouterLink, RouterLinkActive, NuevaLicitacionComponent, AuthNavComponent],
  templateUrl: './panel.html',
  styleUrls: ['./panel.css']
})
export class PanelComponent implements OnInit, OnDestroy {
  categorias: CategoriaServicio[] = [];
  solicitudes: SolicitudCotizacion[] = [];
  propuestasPorSolicitud = new Map<string, PropuestaCotizacion[]>();
  filtroCategoria = '';
  filtroEstado = '';
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
    private router: Router
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

  get solicitudesFiltradas(): SolicitudCotizacion[] {
    return this.solicitudes.filter((s) => {
      const okCategoria = !this.filtroCategoria || s.categoria_id === this.filtroCategoria;
      const okEstado = !this.filtroEstado || s.estado === this.filtroEstado;
      return okCategoria && okEstado;
    });
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
}