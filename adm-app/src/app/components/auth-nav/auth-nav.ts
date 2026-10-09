import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import type { User } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';

/**
 * Bloque de sesión del header corporativo (compartido por todas las vistas).
 *
 *  - Con sesión activa (admin/compras): muestra el correo del usuario y el
 *    botón "Cerrar sesión".
 *  - Sin sesión: muestra un enlace "Ingresar" hacia `/login` para los perfiles
 *    internos (la postulación pública no requiere sesión).
 */
@Component({
  selector: 'app-auth-nav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-nav.html',
  styleUrls: ['./auth-nav.css']
})
export class AuthNavComponent implements OnInit, OnDestroy {
  usuario: User | null = null;
  cerrando = false;
  private suscripcionUsuario?: Subscription;

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.suscripcionUsuario = this.auth.usuario$.subscribe((user) => (this.usuario = user));
  }

  ngOnDestroy() {
    this.suscripcionUsuario?.unsubscribe();
  }

  get nombreMostrado(): string {
    const meta = this.usuario?.user_metadata;
    const nombre = meta?.['nombre'];
    return typeof nombre === 'string' && nombre.trim() ? nombre.trim() : this.usuario!.email ?? '—';
  }

  irAlLogin() {
    this.router.navigate(['/login']);
  }

  /** Confirma y cierra la sesión; al terminar redirige a la home pública. */
  cerrarSesion() {
    if (this.cerrando) return;
    Swal.fire({
      icon: 'question',
      title: 'Cerrar sesión',
      text: '¿Seguro que deseas cerrar tu sesión de administrador?',
      showCancelButton: true,
      confirmButtonText: 'Cerrar sesión',
      cancelButtonText: 'Cancelar'
    }).then((resultado) => {
      if (!resultado.isConfirmed) return;
      this.cerrando = true;
      this.auth
        .cerrarSesion()
        .then(() => {
          this.cerrando = false;
          Swal.fire({
            icon: 'success',
            title: 'Sesión cerrada',
            text: 'Tu sesión fue cerrada correctamente.',
            confirmButtonText: 'Entendido'
          }).then(() => {
            this.router.navigate(['/postulacion']);
          });
        })
        .catch(() => {
          this.cerrando = false;
          this.router.navigate(['/postulacion']);
        });
    });
  }
}