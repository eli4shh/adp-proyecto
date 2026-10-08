import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../core/services/auth';
import { ReservaService } from '../../services/reserva';
import { Reserva } from '../../interfaces/reserva';
import { timer, Subscription, switchMap } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class AdminComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private reservaService = inject(ReservaService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  usuario: User | null = null;
  private refreshSubscription?: Subscription;
  private trabajadoresSubscription?: Subscription;

  // Dashboard Stats
  totalIngresos = 0;
  totalIngresosMes = 0;
  totalConfirmadas = 0;
  totalPendientes = 0;
  totalCanceladas = 0;
  rankingRazas: { raza: string; cantidad: number }[] = [];

  // Gestión de Personal
  trabajadores: User[] = [];
  trabajadorForm: FormGroup;
  registrando = false;

  constructor() {
    this.trabajadorForm = this.fb.group({
      nombre: ['', Validators.required],
      usuario: ['', Validators.required],
      contrasenia: ['', [Validators.required, Validators.minLength(6)]],
      rol: ['trabajador']
    });
  }

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.usuario = user;
      this.cdr.detectChanges();
    });
    
    // Refresh loop
    this.refreshSubscription = timer(0, 2000).subscribe(() => {
      this.cargarDashboard();
    });

    // Auto-refresco de trabajadores con switchMap para evitar fugas de memoria
    this.trabajadoresSubscription = timer(0, 2000).pipe(
      switchMap(() => this.authService.getTrabajadores())
    ).subscribe({
      next: (data) => {
        this.trabajadores = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando trabajadores', err)
    });
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
    if (this.trabajadoresSubscription) {
      this.trabajadoresSubscription.unsubscribe();
    }
  }

  scrollTo(id: string, event: Event) {
    event.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }

  cargarDashboard() {
    const hoy = new Date();
    const tzOffset = hoy.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(hoy.getTime() - tzOffset)).toISOString().slice(0, -1);
    const fechaFiltro = localISOTime.split('T')[0];

    this.reservaService.obtenerMetricas(fechaFiltro).subscribe({
      next: (metricas) => {
        const stats = metricas.statsCitas || [];
        const statsMes = metricas.statsMes || [];
        
        this.totalConfirmadas = stats.find((s: any) => s._id === 'confirmada')?.count || 0;
        this.totalPendientes = stats.find((s: any) => s._id === 'pendiente')?.count || 0;
        this.totalCanceladas = stats.find((s: any) => s._id === 'cancelada')?.count || 0;
        
        const confirmadasMes = statsMes.find((s: any) => s._id === 'confirmada')?.count || 0;

        this.totalIngresos = metricas.ingresosDiarios !== undefined ? metricas.ingresosDiarios : (this.totalConfirmadas * 10);
        this.totalIngresosMes = metricas.ingresosMensuales !== undefined ? metricas.ingresosMensuales : (confirmadasMes * 10);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando estadísticas', err)
    });
    
    // We still load all citas to calculate ranking of breeds
    this.reservaService.obtenerReservas().subscribe({
      next: (citas) => {
        const hoy = new Date();
        const tzOffset = hoy.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(hoy.getTime() - tzOffset)).toISOString().slice(0, -1);
        const fechaFiltro = localISOTime.split('T')[0];
        
        const citasDeHoy = citas.filter(c => c.fecha === fechaFiltro);

        // Calcular ranking de razas
        const razasCount: { [key: string]: number } = {};
        citasDeHoy.filter(c => c.estado === 'confirmada').forEach(c => {
          const raza = c.petRaza || 'Mestizo';
          razasCount[raza] = (razasCount[raza] || 0) + 1;
        });

        this.rankingRazas = Object.keys(razasCount)
          .map(raza => ({ raza, cantidad: razasCount[raza] }))
          .sort((a, b) => b.cantidad - a.cantidad);
        this.cdr.detectChanges();
      }
    });
  }

  cargarTrabajadores() {
    this.authService.getTrabajadores().subscribe({
      next: (data) => {
        this.trabajadores = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error cargando trabajadores', err)
    });
  }

  registrarTrabajador() {
    if (this.trabajadorForm.invalid) return;
    
    this.registrando = true;
    this.authService.registrarTrabajador(this.trabajadorForm.value).subscribe({
      next: (res) => {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Trabajador registrado correctamente',
          showConfirmButton: false,
          timer: 3000
        });
        this.trabajadorForm.reset({ rol: 'trabajador' });
        this.cargarTrabajadores();
        this.registrando = false;
      },
      error: (err) => {
        Swal.fire('Error', err.error?.mensaje || 'Error al registrar trabajador', 'error');
        this.registrando = false;
      }
    });
  }

  eliminarTrabajador(id: string) {
    Swal.fire({
      title: '¿Estás seguro de eliminar a este trabajador?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#aaa'
    }).then((result) => {
      if (result.isConfirmed) {
        this.authService.eliminarTrabajador(id).subscribe({
          next: () => {
            this.trabajadores = this.trabajadores.filter(t => t._id !== id);
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: 'Trabajador eliminado',
              showConfirmButton: false,
              timer: 3000
            });
          },
          error: (err) => Swal.fire('Error', 'Error al eliminar trabajador', 'error')
        });
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}