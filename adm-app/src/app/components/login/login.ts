import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  loginForm: FormGroup = this.fb.group({
    usuario: ['', Validators.required],
    contrasenia: ['', Validators.required]
  });

  errorMessage: string = '';
  isLoading: boolean = false;

  volver() {
    this.router.navigate(['/reserva']);
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    
    const { usuario, contrasenia } = this.loginForm.value;

    this.authService.login(usuario, contrasenia).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.cdr.detectChanges(); // Opcional, pero sugerido
        // Redirigir según el rol
        if (res.usuario.rol === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/panel']);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.mensaje || 'Error al iniciar sesión. Verifica tus credenciales.';
        console.error('Error de login', err);
        this.cdr.detectChanges();
      }
    });
  }
}