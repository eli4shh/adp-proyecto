import { Component, EventEmitter, OnInit, Output, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { ServiciosExternosService } from '../../services/servicios-externos.service';
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
export class NuevaLicitacionComponent implements OnInit {
  /** Se emite al publicar con éxito la nueva licitación. */
  @Output() creada = new EventEmitter<SolicitudCotizacion>();

  abierto = false;
  enviando = false;
  categorias: CategoriaServicio[] = [];
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private servicios: ServiciosExternosService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      titulo: ['', Validators.required],
      categoria_id: ['', Validators.required],
      presupuesto_referencial: [null, [Validators.required, Validators.min(1)]],
      fecha_limite: ['', Validators.required],
      descripcion: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.servicios.listarCategorias().subscribe((cats) => {
      this.categorias = cats;
      this.cdr.markForCheck();
    });
  }

  get f() {
    return this.form.controls;
  }

  abrir() {
    this.abierto = true;
    this.enviando = false;
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

    this.servicios
      .crearSolicitud({
        titulo: (v.titulo as string).trim(),
        categoria_id: v.categoria_id as string,
        descripcion: (v.descripcion as string).trim(),
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
            descripcion: ''
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