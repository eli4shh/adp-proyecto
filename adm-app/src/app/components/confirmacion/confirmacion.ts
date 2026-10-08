import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-confirmacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmacion.html',
  styleUrls: ['./confirmacion.css']
})
export class ConfirmacionComponent {
  private router = inject(Router);

  regresar() {
    this.router.navigate(['/reserva']);
  }

  irALogin() {
    this.router.navigate(['/login']);
  }
}
