import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { ServiciosExternosService } from '../../services/servicios-externos.service';
import { CategoriaServicio, SolicitudCotizacion } from '../../interfaces/servicios-externos';

/**
 * Formulario público de postulación de proveedores (ruta /postulacion).
 * Permite a empresas externas elegir una solicitud abierta, registrar su ficha
 * (RUC, razón social, contacto) y enviar su propuesta económica/técnica.
 */
@Component({
  selector: 'app-postulacion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reserva-form.html',
  styleUrls: ['./reserva-form.css']
})
export class ReservaFormComponent implements OnInit, OnDestroy {
  solicitudes: SolicitudCotizacion[] = [];
  categorias: CategoriaServicio[] = [];
  cargando = true;
  enviando = false;
  archivoBase64: string | null = null;
  nombreArchivo: string | null = null;
  tamanoArchivo: string | null = null;
  form!: FormGroup;
  private suscripciones: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private servicios: ServiciosExternosService,
    private ruta: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.inicializarFormulario();
    this.cargarCatalogo();
  }

  ngOnDestroy() {
    this.suscripciones.forEach((s) => s.unsubscribe());
  }

  get f() {
    return this.form.controls;
  }

  get solicitudSeleccionada(): SolicitudCotizacion | undefined {
    const id = this.form.get('solicitud_id')?.value;
    return this.solicitudes.find((s) => s.id === id);
  }

  get ahorroProyectado(): number {
    const ref = this.solicitudSeleccionada?.presupuesto_referencial ?? 0;
    const monto = Number(this.form.get('monto_cotizado')?.value) || 0;
    return ref - monto;
  }

  private inicializarFormulario() {
    this.form = this.fb.group({
      solicitud_id: ['', Validators.required],
      ruc: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      razon_social: ['', Validators.required],
      nombre_contacto: ['', Validators.required],
      telefono: ['', [Validators.required, Validators.pattern(/^[+\d][\d\s-]{8,14}$/)]],
      email: ['', [Validators.required, Validators.email]],
      anios_experiencia: [0, [Validators.required, Validators.min(0), Validators.max(60)]],
      monto_cotizado: [null, [Validators.required, Validators.min(1)]],
      tiempo_entrega_dias: [null, [Validators.required, Validators.min(1), Validators.max(365)]],
      propuesta_tecnica: ['', Validators.required],
      archivo_url: ['']
    });
  }

  private cargarCatalogo() {
    // Carga paralela de catálogo y solicitudes abiertas (forkJoin).
    this.suscripciones.push(
      forkJoin({
        categorias: this.servicios.listarCategorias(),
        solicitudes: this.servicios.listarSolicitudes({ estado: 'abierta' })
      }).subscribe({
        next: (datos) => {
          this.categorias = datos.categorias;
          this.solicitudes = datos.solicitudes;
          this.cargando = false;
          this.seleccionarSolicitudDesdeQuery();
        },
        error: () => {
          this.cargando = false;
        }
      })
    );
    // Stream reactivo: las licitaciones recién publicadas aparecen al instante.
    this.suscripciones.push(
      this.servicios.solicitudesAbiertas().subscribe({
        next: (sols) => {
          this.solicitudes = sols;
          this.cargando = false;
          this.seleccionarSolicitudDesdeQuery();
        },
        error: () => {
          this.cargando = false;
        }
      })
    );
  }

  /** Preselecciona la licitación indicada vía `?solicitudId=<ID>` o la primera disponible. */
  private seleccionarSolicitudDesdeQuery() {
    const id = this.ruta.snapshot.queryParamMap.get('solicitudId');
    if (id && this.solicitudes.some((s) => s.id === id)) {
      this.form.patchValue({ solicitud_id: id });
      return;
    }
    // Si no viene parámetro en la URL y aún no se ha seleccionado ninguna, seleccionamos la primera activa
    if (this.solicitudes.length > 0 && !this.form.get('solicitud_id')?.value) {
      this.form.patchValue({ solicitud_id: this.solicitudes[0].id });
    }
  }

  formatoTituloSolicitud(s: SolicitudCotizacion): string {
    if (!s) return '';
    if (s.titulo.startsWith('LIC-')) return s.titulo;
    const codigo = s.id.startsWith('a0000000-0000-4000-8000-')
      ? s.id.slice(-3).toUpperCase()
      : s.id.slice(0, 3).toUpperCase();
    return `LIC-2025-${codigo}: ${s.titulo}`;
  }

  categoriaNombre(id: string): string {
    return this.categorias.find((c) => c.id === id)?.nombre ?? '—';
  }

  onArchivoSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.procesarArchivo(file);
    }
  }

  onArchivoSoltado(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.procesarArchivo(file);
    }
  }

  private procesarArchivo(file: File) {
    if (!file.type.startsWith('application/pdf') && !file.type.startsWith('image/')) {
      Swal.fire('Atención', 'Adjunta un PDF o una imagen (JPG/PNG).', 'warning');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      Swal.fire('Atención', 'El archivo supera los 10 MB permitidos.', 'warning');
      return;
    }

    this.nombreArchivo = file.name;
    const mb = file.size / (1024 * 1024);
    this.tamanoArchivo = mb < 1 ? `${Math.round(file.size / 1024)} KB` : `${mb.toFixed(1)} MB`;

    const reader = new FileReader();
    reader.onload = () => {
      this.archivoBase64 = reader.result as string;
      this.form.patchValue({ archivo_url: this.nombreArchivo });
    };
    reader.readAsDataURL(file);
  }

  eliminarArchivo() {
    this.nombreArchivo = null;
    this.archivoBase64 = null;
    this.tamanoArchivo = null;
    this.form.patchValue({ archivo_url: '' });
  }

  verArchivo() {
    if (this.archivoBase64) {
      const win = window.open();
      if (win) {
        win.document.write(
          `<iframe src="${this.archivoBase64}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`
        );
      }
    } else {
      Swal.fire('Documento adjunto', `Archivo: ${this.nombreArchivo}`, 'info');
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => c.markAsTouched());
      Swal.fire('Atención', 'Revisa los campos marcados en rojo e inténtalo de nuevo.', 'warning');
      return;
    }

    const v = this.form.value;
    this.enviando = true;
    Swal.fire({
      title: 'Enviando postulación...',
      text: 'Estamos registrando tu propuesta, por favor espera.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const aniosExp = Number(v.anios_experiencia) || 0;
    const califHistorica = Number(Math.min(5.0, Math.max(3.5, 3.5 + aniosExp * 0.25)).toFixed(1));

    this.servicios
      .enviarPostulacion({
        proveedor: {
          ruc: v.ruc,
          razon_social: v.razon_social,
          nombre_contacto: v.nombre_contacto,
          telefono: v.telefono,
          email: v.email,
          anios_experiencia: aniosExp,
          calificacion_historica: califHistorica
        },
        propuesta: {
          solicitud_id: v.solicitud_id,
          monto_cotizado: Number(v.monto_cotizado),
          tiempo_entrega_dias: Number(v.tiempo_entrega_dias),
          propuesta_tecnica: v.propuesta_tecnica,
          archivo_url: this.archivoBase64 ?? (v.archivo_url || null)
        }
      })
      .subscribe({
        next: () => {
          this.enviando = false;
          Swal.fire({
            icon: 'success',
            title: '¡Postulación registrada!',
            text: 'Tu propuesta fue recibida y quedará disponible para la evaluación del equipo de compras.',
            confirmButtonText: 'Entendido'
          }).then(() => {
            this.form.reset({
              anios_experiencia: 0,
              solicitud_id: this.solicitudes.length ? this.solicitudes[0].id : '',
              ruc: '',
              razon_social: '',
              nombre_contacto: '',
              telefono: '',
              email: '',
              monto_cotizado: null,
              tiempo_entrega_dias: null,
              propuesta_tecnica: '',
              archivo_url: ''
            });
            this.archivoBase64 = null;
            this.nombreArchivo = null;
            this.tamanoArchivo = null;
          });
        },
        error: () => {
          this.enviando = false;
          Swal.fire('Error', 'No se pudo enviar tu postulación. Inténtalo nuevamente.', 'error');
        }
      });
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }
}
