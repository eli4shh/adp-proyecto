import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReservaService } from '../../services/reserva';
import { AuthService, User } from '../../core/services/auth';
import { Reserva } from '../../interfaces/reserva';
import { Router } from '@angular/router';
import { timer, Subscription } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './panel.html',
  styleUrls: ['./panel.css']
})
export class PanelComponent implements OnInit, OnDestroy {
  private reservaService = inject(ReservaService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  usuario: User | null = null;
  citasPendientes: Reserva[] = [];
  citasConfirmadasHoy: Reserva[] = [];
  citasConfirmadasFuturas: Reserva[] = [];
  cargandoCitas = true;
  cerrandoCaja = false;
  private refreshSubscription?: Subscription;

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user && user.rol !== 'trabajador') {
        // Bloqueo y redirección si el rol cambió en otra pestaña (ej. a admin)
        this.usuario = null;
        this.citasPendientes = [];
        this.citasConfirmadasHoy = [];
        this.citasConfirmadasFuturas = [];
        this.router.navigate(['/admin']);
        return;
      }
      this.usuario = user;
      this.cdr.detectChanges();
    });
    
    // Configurar el auto-refresco cada 2 segundos
    this.refreshSubscription = timer(0, 2000).subscribe(() => {
      this.cargarCitasPendientes();
    });
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  cargarCitasPendientes() {
    this.reservaService.obtenerReservas().subscribe({
      next: (citas) => {
        const hoy = new Date();
        const tzOffset = hoy.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(hoy.getTime() - tzOffset)).toISOString().slice(0, -1);
        const fechaFiltro = localISOTime.split('T')[0];

        this.citasPendientes = citas.filter(c => c.estado === 'pendiente');
        
        // Separar las citas confirmadas
        this.citasConfirmadasHoy = citas.filter(c => c.estado === 'confirmada' && c.fecha === fechaFiltro);
        this.citasConfirmadasFuturas = citas.filter(c => c.estado === 'confirmada' && c.fecha > fechaFiltro);
        
        this.cargandoCitas = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar citas:', err);
        this.cargandoCitas = false;
        this.cdr.detectChanges();
      }
    });
  }

  confirmarCita(cita: Reserva) {
    if (!cita._id) return;

    Swal.fire({
      title: '¿Estás seguro de confirmar esta cita?',
      text: 'Esto sumará S/. 10 a tu caja.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, confirmar',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#aaa'
    }).then((result) => {
      if (result.isConfirmed) {
        this.reservaService.confirmarCita(cita._id!).subscribe({
          next: (res) => {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: 'Cita Confirmada correctamente',
              showConfirmButton: false,
              timer: 3000
            });
            // Actualizar datos de forma local antes del próximo poll
            this.citasPendientes = this.citasPendientes.filter(c => c._id !== cita._id);
            
            const hoy = new Date();
            const tzOffset = hoy.getTimezoneOffset() * 60000;
            const fechaFiltro = (new Date(hoy.getTime() - tzOffset)).toISOString().split('T')[0];
            
            if (cita.fecha === fechaFiltro) {
              this.citasConfirmadasHoy.push({ ...cita, estado: 'confirmada' });
            } else if (cita.fecha > fechaFiltro) {
              this.citasConfirmadasFuturas.push({ ...cita, estado: 'confirmada' });
            }
            
            if (this.usuario) {
               const userActualizado = { ...this.usuario, cajaAcumulada: (this.usuario.cajaAcumulada || 0) + 10 };
               this.usuario = userActualizado;
            }
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Error al confirmar cita', err);
            Swal.fire('Error', err.error?.mensaje || 'Ocurrió un error al confirmar la cita.', 'error');
          }
        });
      }
    });
  }

  cancelarCitaConMotivo(cita: Reserva) {
    if (!cita._id) return;

    Swal.fire({
      title: 'Explicar motivo de la cancelación',
      input: 'textarea',
      inputPlaceholder: 'Ej. Voucher falso, Horario agotado...',
      showCancelButton: true,
      confirmButtonText: 'Cancelar cita',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#aaa',
      inputValidator: (value) => {
        if (!value || value.trim() === '') {
          return 'Debes explicar el motivo de la cancelación';
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const motivo = result.value;
        this.reservaService.cancelarCita(cita._id!).subscribe({
          next: (res) => {
            Swal.fire({
              icon: 'success',
              title: 'Cita cancelada correctamente',
              text: 'Se abrirá WhatsApp para notificar al cliente.'
            }).then(() => {
              this.citasPendientes = this.citasPendientes.filter(c => c._id !== cita._id);
              this.cdr.detectChanges();

              // Notificar vía WhatsApp
              const telefono = cita.tutorCelular?.replace(/\D/g, '');
              if (telefono) {
                const numeroFinal = telefono.length === 9 ? `51${telefono}` : telefono;
                const mensaje = encodeURIComponent(`Hola ${cita.tutorNombre} somos de Huellitas Pet Grooming, lamentamos informarle que su cita para ${cita.petNombre} fue cancelada por el siguiente motivo: ${motivo.trim()}`);
                const url = `https://wa.me/${numeroFinal}?text=${mensaje}`;
                window.open(url, '_blank');
              } else {
                Swal.fire('Atención', 'No hay un número de teléfono válido para enviar el WhatsApp de cancelación.', 'warning');
              }
            });
          },
          error: (err) => {
            console.error('Error al cancelar cita', err);
            const errorMessage = err.error?.message || err.error?.mensaje || 'La reserva ya cambió de estado.';
            Swal.fire({
              icon: 'error',
              title: '¡Acción no permitida!',
              text: errorMessage,
              confirmButtonText: 'Entendido',
              confirmButtonColor: '#ffb6c1'
            }).then(() => {
              this.cargarCitasPendientes();
            });
          }
        });
      }
    });
  }

  abrirWhatsApp(cita: Reserva) {
    const telefono = cita.tutorCelular?.replace(/\D/g, ''); // Remover caracteres no numéricos
    if (!telefono) {
       Swal.fire('Atención', 'No hay un número de teléfono válido.', 'warning');
       return;
    }
    // Prefijo de Perú (51) si no lo tiene. Asumimos que los teléfonos de Perú empiezan con 9 y tienen 9 dígitos.
    const numeroFinal = telefono.length === 9 ? `51${telefono}` : telefono;
    
    const mensaje = encodeURIComponent(`Hola ${cita.tutorNombre}, tu cita para ${cita.petNombre} a las ${cita.hora} ha sido confirmada.`);
    const url = `https://wa.me/${numeroFinal}?text=${mensaje}`;
    
    window.open(url, '_blank');
  }

  abrirExpediente(cita: Reserva) {
    const horarios = [
      '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', 
      '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'
    ];
    
    const optionsHtml = horarios.map(h => 
      `<option value="${h}" ${cita.hora === h ? 'selected' : ''}>${h}</option>`
    ).join('');

    Swal.fire({
      title: 'Expediente Médico',
      html: `
        <div style="text-align: left; font-size: 0.9em; line-height: 1.4;">
          <h4 style="margin-top:0; margin-bottom:5px; color:var(--primary-color);">👤 SECCIÓN CLIENTE</h4>
          <p style="margin: 3px 0;"><strong>Tutor:</strong> ${cita.tutorNombre}</p>
          <p style="margin: 3px 0;"><strong>Celular:</strong> ${cita.tutorCelular}</p>
          <p style="margin: 3px 0;"><strong>Nº Extra:</strong> ${cita.tutorCelular2 || '-'}</p>
          
          <hr style="margin: 15px 0;">
          
          <h4 style="margin-top:0; margin-bottom:5px; color:var(--primary-color);">🐾 SECCIÓN MASCOTA</h4>
          <p style="margin: 3px 0;"><strong>Mascota:</strong> ${cita.petNombre} (${cita.petRaza || 'Mestizo'})</p>
          <p style="margin: 3px 0; margin-bottom: 15px;"><strong>Cita Actual:</strong> ${cita.fecha} a las ${cita.hora}</p>
          
          <div style="margin-bottom: 10px;">
            <label style="font-weight: bold; display:block; margin-bottom: 3px;">Alergias:</label>
            <input type="text" id="swal-alergias" class="swal2-input" style="height: 35px; width: 100%; margin: 0; box-sizing: border-box;" value="${cita.petAlergias || ''}" placeholder="Opcional">
          </div>
          <div style="margin-bottom: 10px;">
            <label style="font-weight: bold; display:block; margin-bottom: 3px;">Condición Médica:</label>
            <input type="text" id="swal-condicion" class="swal2-input" style="height: 35px; width: 100%; margin: 0; box-sizing: border-box;" value="${cita.petCondicionMedica || ''}" placeholder="Opcional">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold; display:block; margin-bottom: 3px;">Observaciones:</label>
            <textarea id="swal-observaciones" class="swal2-textarea" style="height: 60px; width: 100%; margin: 0; box-sizing: border-box; padding: 10px;" placeholder="Opcional">${cita.observaciones || ''}</textarea>
          </div>
          
          <hr style="margin: 15px 0;">
          
          <h4 style="margin-top:0; margin-bottom:5px; color:var(--primary-color);">🔄 REPROGRAMAR CITA</h4>
          <div style="display:flex; gap:10px; margin-bottom: 15px;">
            <div style="flex: 1;">
              <label style="font-size:0.8em; font-weight:bold; display:block;">Fecha</label>
              <input type="date" id="swal-fecha" class="swal2-input" style="height: 35px; width:100%; margin: 0;" value="${cita.fecha}">
            </div>
            <div style="flex: 1;">
               <label style="font-size:0.8em; font-weight:bold; display:block;">Hora</label>
               <select id="swal-hora" class="swal2-select" style="height: 35px; width:100%; margin: 0; padding: 0 10px;">
                 ${optionsHtml}
               </select>
            </div>
          </div>
          
          <div style="text-align: center;">
            <button type="button" id="btn-swal-cancelar" class="swal2-cancel swal2-styled" style="background-color: #d33; width: 100%; margin: 0; font-weight:bold; display:flex; justify-content:center; align-items:center; gap:5px;">
              <span class="material-symbols-rounded" style="font-size: 1.2rem;">cancel</span> Cancelar Cita
            </button>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cerrar',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#aaa',
      didOpen: () => {
        const cancelBtn = document.getElementById('btn-swal-cancelar');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            Swal.close();
            this.cancelarCitaConMotivo(cita);
          });
        }
      },
      preConfirm: () => {
        const alergias = (document.getElementById('swal-alergias') as HTMLInputElement).value;
        const condicion = (document.getElementById('swal-condicion') as HTMLInputElement).value;
        const observaciones = (document.getElementById('swal-observaciones') as HTMLTextAreaElement).value;
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value;
        const hora = (document.getElementById('swal-hora') as HTMLSelectElement).value;

        return {
          petAlergias: alergias,
          petCondicionMedica: condicion,
          observaciones: observaciones,
          fecha: fecha,
          hora: hora
        };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const data = result.value;
        if (!cita._id) return;
        this.reservaService.actualizarCita(cita._id, data).subscribe({
          next: (res) => {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: 'Cita actualizada correctamente',
              showConfirmButton: false,
              timer: 2000
            });
            this.cargarCitasPendientes();
          },
          error: (err) => {
            console.error('Error al actualizar cita', err);
            Swal.fire('Error', err.error?.mensaje || 'No se pudo actualizar la cita', 'error');
          }
        });
      }
    });
  }

  cerrarCaja() {
    if (!this.usuario) return;
    
    if (this.usuario.cajaAcumulada === 0) {
      Swal.fire('Atención', 'La caja ya está en S/. 0.', 'warning');
      return;
    }

    Swal.fire({
      title: '¿Estás seguro de cerrar tu caja?',
      text: `Se rendirán S/. ${this.usuario.cajaAcumulada} al administrador y tu acumulado volverá a 0.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar caja',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33'
    }).then((result) => {
      if (result.isConfirmed) {
        this.cerrandoCaja = true;
        this.cdr.detectChanges();
        this.authService.cerrarCaja().subscribe({
          next: (res) => {
            Swal.fire({
              icon: 'success',
              title: 'Cierre de Caja Exitoso',
              html: `Caja cerrada. Total rendido: <b>S/. ${res.totalRendido}</b>`,
              confirmButtonText: 'Aceptar',
              buttonsStyling: true,
              customClass: {
                confirmButton: 'swal2-confirm swal2-styled'
              }
            });
            this.cerrandoCaja = false;
            if (this.usuario) {
              this.usuario = { ...this.usuario, cajaAcumulada: 0 };
            }
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Error cerrando caja:', err);
            Swal.fire('Error', 'Hubo un error al cerrar la caja.', 'error');
            this.cerrandoCaja = false;
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}