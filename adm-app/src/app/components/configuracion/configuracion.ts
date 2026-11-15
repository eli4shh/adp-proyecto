import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import type { User } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { EvaluacionService, PesosEvaluacion, PESOS_POR_DEFECTO } from '../../services/evaluacion.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './configuracion.html',
  styleUrls: ['./configuracion.css']
})
export class ConfiguracionComponent implements OnInit {
  // Valores en porcentaje (0 - 100)
  pesoCosto = 35;
  pesoExperiencia = 25;
  pesoDisponibilidad = 20;
  pesoHistorico = 20;

  guardadoExitoso = false;

  constructor(
    private evaluacionService: EvaluacionService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const p = this.evaluacionService.getPesos();
    this.pesoCosto = Math.round(p.costo * 100);
    this.pesoExperiencia = Math.round(p.experiencia * 100);
    this.pesoDisponibilidad = Math.round(p.disponibilidad * 100);
    this.pesoHistorico = Math.round(p.historico * 100);
  }

  get sumaTotal(): number {
    return (
      (Number(this.pesoCosto) || 0) +
      (Number(this.pesoExperiencia) || 0) +
      (Number(this.pesoDisponibilidad) || 0) +
      (Number(this.pesoHistorico) || 0)
    );
  }

  get esValido(): boolean {
    return this.sumaTotal === 100;
  }

  restablecer() {
    this.pesoCosto = Math.round(PESOS_POR_DEFECTO.costo * 100);
    this.pesoExperiencia = Math.round(PESOS_POR_DEFECTO.experiencia * 100);
    this.pesoDisponibilidad = Math.round(PESOS_POR_DEFECTO.disponibilidad * 100);
    this.pesoHistorico = Math.round(PESOS_POR_DEFECTO.historico * 100);
    this.evaluacionService.restablecerPesos();
    Swal.fire({
      icon: 'info',
      title: 'Valores restablecidos',
      text: 'Se aplicaron los pesos recomendados por defecto (35% / 25% / 20% / 20%).',
      timer: 1500,
      showConfirmButton: false
    });
  }

  guardar() {
    if (!this.esValido) {
      Swal.fire({
        icon: 'error',
        title: 'Suma inválida',
        text: `La suma de ponderaciones es ${this.sumaTotal}%. Debe sumar exactamente 100%.`
      });
      return;
    }

    const nuevosPesos: PesosEvaluacion = {
      costo: this.pesoCosto / 100,
      experiencia: this.pesoExperiencia / 100,
      disponibilidad: this.pesoDisponibilidad / 100,
      historico: this.pesoHistorico / 100
    };

    this.evaluacionService.setPesos(nuevosPesos);
    this.guardadoExitoso = true;
    setTimeout(() => (this.guardadoExitoso = false), 4000);

    Swal.fire({
      icon: 'success',
      title: 'Configuración guardada',
      text: 'Los nuevos pesos impactan de forma inmediata en las evaluaciones de cotizaciones.',
      timer: 1800,
      showConfirmButton: false
    });
  }

  get usuarioActual(): User | null {
    return this.auth.usuarioActual;
  }

  get nombreUsuario(): string {
    const u = this.usuarioActual;
    if (!u) return 'Valeria Soto';
    const meta = u.user_metadata;
    if (meta && typeof meta['nombre'] === 'string' && meta['nombre'].trim()) {
      return meta['nombre'].trim();
    }
    if (meta && typeof meta['full_name'] === 'string' && meta['full_name'].trim()) {
      return meta['full_name'].trim();
    }
    if (meta && typeof meta['name'] === 'string' && meta['name'].trim()) {
      return meta['name'].trim();
    }
    if (u.email) {
      const alias = u.email.split('@')[0];
      return alias
        .split(/[._-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return 'Valeria Soto';
  }

  get rolUsuario(): string {
    const u = this.usuarioActual;
    if (!u) return 'Jefa de Compras & Licitaciones';
    const meta = u.user_metadata;
    if (meta && typeof meta['rol'] === 'string' && meta['rol'].trim()) {
      return meta['rol'].trim();
    }
    if (meta && typeof meta['cargo'] === 'string' && meta['cargo'].trim()) {
      return meta['cargo'].trim();
    }
    return 'Jefa de Compras & Licitaciones';
  }

  get inicialesUsuario(): string {
    const nombre = this.nombreUsuario.trim();
    if (!nombre) return 'VS';
    const palabras = nombre.split(/\s+/).filter(Boolean);
    if (palabras.length >= 2) {
      return (palabras[0][0] + palabras[1][0]).toUpperCase();
    }
    return nombre.slice(0, 2).toUpperCase();
  }

  verPerfil() {
    const u = this.usuarioActual;
    const correo = u?.email ?? 'valeria.soto@grandmarina.pe';
    const id = u?.id ? u.id.slice(0, 8) + '…' : 'USR-CORP-441';

    Swal.fire({
      title: 'Perfil de Usuario',
      html: `
        <div style="text-align: left; padding: 6px 0; font-size: 13.5px; color: #1e293b;">
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #2563eb; color: #fff; font-weight: 700; font-size: 18px; display: flex; align-items: center; justify-content: center;">
              ${this.inicialesUsuario}
            </div>
            <div>
              <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${this.nombreUsuario}</div>
              <div style="color: #2563eb; font-weight: 600; font-size: 12.5px;">${this.rolUsuario}</div>
            </div>
          </div>
          <div style="display: grid; gap: 8px; font-size: 13px;">
            <div><strong style="color: #64748b;">Correo institucional:</strong> <span style="color: #0f172a;">${correo}</span></div>
            <div><strong style="color: #64748b;">Organización:</strong> <span style="color: #0f172a;">Grand Marina Resort &amp; Convention Center</span></div>
            <div><strong style="color: #64748b;">Área:</strong> <span style="color: #0f172a;">Dirección de Compras, Licitaciones y Servicios</span></div>
            <div><strong style="color: #64748b;">ID de Sesión:</strong> <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11.5px; color: #475569;">${id}</code></div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Cerrar Sesión',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cerrar',
      cancelButtonColor: '#64748b'
    }).then((res) => {
      if (res.isConfirmed) {
        this.cerrarSesion();
      }
    });
  }

  cerrarSesion() {
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: 'Se finalizará tu sesión en el sistema de adquisiciones corporativas.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b'
    }).then((res) => {
      if (res.isConfirmed) {
        this.auth.cerrarSesion().then(() => {
          Swal.fire({
            icon: 'success',
            title: 'Sesión finalizada',
            text: 'Has cerrado sesión exitosamente.',
            timer: 1200,
            showConfirmButton: false
          }).then(() => {
            this.router.navigate(['/login']);
          });
        });
      }
    });
  }
}
