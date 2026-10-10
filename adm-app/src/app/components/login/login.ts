import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { from } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/services/auth.service';
import { AuthNavComponent } from '../auth-nav/auth-nav';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AuthNavComponent],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  form!: FormGroup;
  enviando = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private ruta: ActivatedRoute
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  get f() {
    return this.form.controls;
  }

  get destinoTrasLogin(): string {
    const redirigir = this.ruta.snapshot.queryParamMap.get('redirectTo');
    return redirigir && redirigir.startsWith('/') ? redirigir : '/bandeja';
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => c.markAsTouched());
      Swal.fire('Atención', 'Ingresa tu correo corporativo y tu contraseña.', 'warning');
      return;
    }

    const v = this.form.value;
    this.enviando = true;

    from(this.auth.iniciarSesion(v.email as string, v.password as string)).subscribe({
      next: (usuario) => {
        this.enviando = false;
        const correo = usuario.email ?? '';
        Swal.close();
        Swal.fire({
          icon: 'success',
          title: '¡Bienvenido!',
          html: `Sesión iniciada para <b>${correo}</b>.<br><span style="color:#a1a1aa">Ingresando al panel...</span>`,
          timer: 1200,
          timerProgressBar: true,
          showConfirmButton: false,
          allowOutsideClick: false
        }).then(() => {
          this.router.navigateByUrl(this.destinoTrasLogin);
        });
      },
      error: (err: Error) => {
        this.enviando = false;
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'No se pudo iniciar sesión',
          text: err?.message ?? 'Verifica tus credenciales e inténtalo nuevamente.',
          confirmButtonText: 'Reintentar'
        });
      }
    });
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }
}