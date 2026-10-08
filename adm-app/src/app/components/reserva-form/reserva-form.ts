import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReservaService } from '../../services/reserva';
import { Reserva } from '../../interfaces/reserva';
import { Router } from '@angular/router'; 
import Swal from 'sweetalert2';

@Component({
  selector: 'app-reserva-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reserva-form.html',
  styleUrl: './reserva-form.css'
})
export class ReservaFormComponent implements OnInit {
  qrUrl: string = 'qr-pago.png';
  logoUrl: string = 'logo.png'; 
  
  reservaForm!: FormGroup;
  comprobanteBase64: string = ''; 
  imageError: string | null = null;
  isCompressing: boolean = false; 

  horariosDisponibles: string[] = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', 
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'
  ];
  
  horariosBloqueados: string[] = [];
  fechaMinima: string = '';
  fechaMaxima: string = '';
  
  constructor(
    private fb: FormBuilder, 
    private reservaService: ReservaService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initForm();
    this.configurarLimitesFecha();
    
    this.reservaForm.get('fecha')?.valueChanges.subscribe(fechaSeleccionada => {
      if (fechaSeleccionada) {
        this.cargarHorariosOcupados(fechaSeleccionada);
      }
    });
  }

  configurarLimitesFecha() {
    // Calcular fecha actual de Lima
    const hoy = new Date();
    const tzOffsetLima = hoy.getTimezoneOffset() * 60000;
    const dateLima = new Date(hoy.getTime() - tzOffsetLima);
    this.fechaMinima = dateLima.toISOString().split('T')[0];

    // Calcular fecha máxima (10 días)
    const fechaMax = new Date(dateLima);
    fechaMax.setDate(fechaMax.getDate() + 10);
    this.fechaMaxima = fechaMax.toISOString().split('T')[0];
  }

  irALogin() {
    this.router.navigate(['/login']);
  }

  initForm() {
    this.reservaForm = this.fb.group({
      tutorNombre: ['', Validators.required],
      tutorDireccion: ['', Validators.required],
      tutorCelular: ['', [Validators.required, Validators.pattern('^\\s*[0-9]{9}\\s*$')]],
      tutorCelular2: [''], 
      observaciones: [''],
      petNombre: ['', Validators.required],
      petRaza: ['', Validators.required],
      petEdad: ['', Validators.required],
      petColor: ['', Validators.required],
      petSexo: ['', Validators.required],
      petAlergias: [''],
      petCondicionMedica: [''],
      fecha: ['', Validators.required],
      hora: ['', Validators.required]
    });
  }

  get f() { return this.reservaForm.controls; }

  cargarHorariosOcupados(fecha: string) {
    this.reservaService.obtenerHorariosOcupados(fecha).subscribe({
      next: (reservas) => {
        this.horariosBloqueados = reservas.map(r => r.hora);
      },
      error: (err) => console.error('Error al cargar horarios ocupados:', err)
    });
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    this.imageError = null;
    this.comprobanteBase64 = ''; 
    this.isCompressing = false;

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.imageError = "El archivo debe ser una imagen (JPG o PNG).";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.comprobanteBase64 = e.target.result;
      this.isCompressing = false; 
      console.log('¡Imagen lista en Base64 para MongoDB!');
      
      this.cdr.detectChanges();
    };

    reader.onerror = () => {
      this.imageError = "Error al leer el archivo.";
      this.isCompressing = false;
      this.cdr.detectChanges();
    };

    reader.readAsDataURL(file);
  }

  isHoraBloqueada(hora: string): boolean {
    return this.horariosBloqueados.includes(hora);
  }

  async onSubmit() {
    if (this.reservaForm.valid) {
      
      const reservaCompleta: Reserva = {
        ...this.reservaForm.value,
        urlCaptura: this.comprobanteBase64 || '', 
        estado: 'pendiente'
      };

      console.log('Enviando datos al backend de Node.js:', reservaCompleta);
      
      Swal.fire({
        title: 'Procesando tu reserva...',
        text: 'Estamos registrando a tu mascota, por favor espera.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });
      
      this.reservaService.crearReserva(reservaCompleta).subscribe({
        next: (response: any) => {
          console.log('¡Reserva registrada con éxito en Atlas!', response);
          Swal.fire({
            title: '¡Reserva Registrada!',
            text: 'Tu solicitud ha sido enviada con éxito. Serás redirigido a la pantalla de confirmación.',
            icon: 'success',
            timer: 2500,
            showConfirmButton: false
          }).then(() => {
            this.reservaForm.reset();
            this.comprobanteBase64 = '';
            this.router.navigate(['/confirmacion']);
            window.scrollTo(0, 0);
          });
        },
        error: (error: any) => {
          console.error("Error al guardar la reserva en el backend:", error);
          const mensajeError = error.error?.message || error.error || 'El horario seleccionado ya no está disponible. Por favor, elige otra hora o fecha.';
          
          Swal.fire({
            icon: 'error',
            title: '¡Horario no disponible!',
            text: mensajeError,
            confirmButtonText: 'Elegir otro horario',
            confirmButtonColor: '#ffb6c1'
          }).then(() => {
            this.reservaForm.get('hora')?.setValue('');
            const fechaActual = this.reservaForm.get('fecha')?.value;
            if (fechaActual) {
              this.cargarHorariosOcupados(fechaActual);
            }
          });
        }
      });

    } else {
      Object.values(this.reservaForm.controls).forEach(control => {
        control.markAsTouched();
      });
      Swal.fire('Atención', 'Por favor, completa todos los campos del formulario.', 'warning');
    }
  }
}