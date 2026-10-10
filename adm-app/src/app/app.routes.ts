import { Routes } from '@angular/router';
import { ReservaFormComponent } from './components/reserva-form/reserva-form';
import { PanelComponent } from './components/panel/panel';
import { AdminComponent } from './components/admin/admin';
import { LoginComponent } from './components/login/login';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, data: { titulo: 'Acceso interno' } },
  {
    path: 'postulacion',
    component: ReservaFormComponent,
    data: { titulo: 'Postulación de Proveedores' }
  },
  {
    path: 'bandeja',
    component: PanelComponent,
    canActivate: [authGuard],
    data: { titulo: 'Bandeja de Cotizaciones' }
  },
  {
    path: 'evaluacion',
    component: AdminComponent,
    canActivate: [authGuard],
    data: { titulo: 'Evaluación y Adjudicación' }
  },
  // Redirecciones automáticas para URLs anteriores
  { path: 'cotizaciones', redirectTo: 'bandeja', pathMatch: 'full' },
  { path: 'admin', redirectTo: 'evaluacion', pathMatch: 'full' },
  { path: '', redirectTo: 'postulacion', pathMatch: 'full' },
  { path: '**', redirectTo: 'postulacion' }
];