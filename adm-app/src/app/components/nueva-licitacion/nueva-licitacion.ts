import { Component, EventEmitter, OnInit, OnDestroy, Output, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import { ServiciosExternosService } from '../../services/servicios-externos.service';
import { EvaluacionService, PesosEvaluacion, PESOS_POR_DEFECTO } from '../../services/evaluacion.service';
import {
  CategoriaServicio,
  NuevaSolicitudPayload,
  SolicitudCotizacion
} from '../../interfaces/servicios-externos';

/**
 * Modal "Nueva Licitación" (compartido por /cotizaciones y /admin).
 * Publica una solicitud de cotización en estado `abierta` y emite la entidad
 * creada para que la bandeja actualice su lista al instante.
 */
@Component({
  selector: 'app-nueva-licitacion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-licitacion.html',
  styleUrls: ['./nueva-licitacion.css']
})
export class NuevaLicitacionComponent implements OnInit, OnDestroy {
  /** Se emite al publicar con éxito la nueva licitación. */
  @Output() creada = new EventEmitter<SolicitudCotizacion>();

  abierto = false;
  enviando = false;
  categorias: CategoriaServicio[] = [];
  form!: FormGroup;

  pesosActivos: PesosEvaluacion = { ...PESOS_POR_DEFECTO };
  private suscripciones: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private servicios: ServiciosExternosService,
    private evaluacionService: EvaluacionService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      titulo: ['', Validators.required],
      categoria_id: ['', Validators.required],
      presupuesto_referencial: [null, [Validators.required, Validators.min(1)]],
      fecha_limite: ['', Validators.required],
      descripcion: ['', Validators.required],
      anios_experiencia_minimos: [3, [Validators.required, Validators.min(0), Validators.max(30)]]
    });
  }

  ngOnInit() {
    this.suscripciones.push(
      this.servicios.listarCategorias().subscribe((cats) => {
        this.categorias = cats;
        this.cdr.markForCheck();
      })
    );

    // Reacciona al cambio de categoría para actualizar los pesos algorítmicos en vivo
    this.suscripciones.push(
      this.form.get('categoria_id')!.valueChanges.subscribe((catId) => {
        this.actualizarPesosCategoria(catId);
      })
    );

    // Reacciona si en /configuracion se cambian los pesos de las categorías
    this.suscripciones.push(
      this.evaluacionService.cambioPesos$.subscribe(() => {
        this.actualizarPesosCategoria(this.form.get('categoria_id')?.value);
      })
    );

    this.actualizarPesosCategoria(null);
  }

  ngOnDestroy() {
    this.suscripciones.forEach((s) => s.unsubscribe());
  }

  actualizarPesosCategoria(catIdOrNombre?: string | null) {
    this.pesosActivos = this.evaluacionService.getPesosDeCategoria(catIdOrNombre);
    this.cdr.markForCheck();
  }

  get pesoCosto(): number {
    return Math.round(this.pesosActivos.costo * 100);
  }

  get pesoExperiencia(): number {
    return Math.round(this.pesosActivos.experiencia * 100);
  }

  get pesoDisponibilidad(): number {
    return Math.round(this.pesosActivos.disponibilidad * 100);
  }

  get pesoHistorico(): number {
    return Math.round(this.pesosActivos.historico * 100);
  }

  get nombreCategoriaSeleccionada(): string {
    const id = this.form.get('categoria_id')?.value;
    if (!id) return 'General';
    const c = this.categorias.find((item) => item.id === id);
    return c?.nombre ?? 'General';
  }

  cambiarAnios(delta: number) {
    const ctrl = this.form.get('anios_experiencia_minimos');
    const actual = Number(ctrl?.value) || 0;
    const nuevo = Math.max(0, Math.min(30, actual + delta));
    ctrl?.setValue(nuevo);
    this.cdr.markForCheck();
  }

  get f() {
    return this.form.controls;
  }

  abrir() {
    this.abierto = true;
    this.enviando = false;
    this.actualizarPesosCategoria(this.form.get('categoria_id')?.value);
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  cerrar() {
    this.abierto = false;
    this.enviando = false;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.abierto) {
      this.cerrar();
    }
  }

  publicar() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => c.markAsTouched());
      Swal.fire('Atención', 'Completa todos los campos obligatorios de la licitación.', 'warning');
      return;
    }

    const v = this.form.value;
    this.enviando = true;
    this.cdr.markForCheck();

    const anios = Number(v.anios_experiencia_minimos) || 0;
    const reqTexto = `\n\n[Requisito Técnico: Mínimo ${anios} años de experiencia certificada en el rubro].`;
    const descFinal = ((v.descripcion as string).trim()) + reqTexto;

    this.servicios
      .crearSolicitud({
        titulo: (v.titulo as string).trim(),
        categoria_id: v.categoria_id as string,
        descripcion: descFinal,
        presupuesto_referencial: Number(v.presupuesto_referencial),
        fecha_limite: v.fecha_limite as string
      } satisfies NuevaSolicitudPayload)
      .subscribe({
        next: (solicitud) => {
          this.enviando = false;
          this.abierto = false;
          this.form.reset({
            titulo: '',
            categoria_id: '',
            presupuesto_referencial: null,
            fecha_limite: '',
            descripcion: '',
            anios_experiencia_minimos: 3
          });
          this.cdr.markForCheck();
          this.cdr.detectChanges();

          Swal.fire({
            icon: 'success',
            title: 'Licitación publicada correctamente',
            html: `La solicitud <b>${solicitud.titulo}</b> ya está disponible para postulaciones en estado <b>Abierta</b>.`,
            confirmButtonText: 'Entendido'
          });
          this.creada.emit(solicitud);
        },
        error: () => {
          this.enviando = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
          Swal.fire('Error', 'No se pudo publicar la licitación. Inténtalo nuevamente.', 'error');
        }
      });
  }
}