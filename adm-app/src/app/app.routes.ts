import { Routes } from '@angular/router';
import { ReservaFormComponent } from './components/reserva-form/reserva-form'; 
import { ConfirmacionComponent } from './components/confirmacion/confirmacion';
import { LoginComponent } from './components/login/login';
import { PanelComponent } from './components/panel/panel';
import { AdminComponent } from './components/admin/admin';
import { authGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  { path: 'reserva', component: ReservaFormComponent },
  { path: 'confirmacion', component: ConfirmacionComponent },
  { path: 'login', component: LoginComponent },
  { 
    path: 'panel', 
    component: PanelComponent,
    canActivate: [authGuard],
    data: { roles: ['trabajador', 'admin'] }
  },
  { 
    path: 'admin', 
    component: AdminComponent,
    canActivate: [authGuard],
    data: { roles: ['admin'] }
  },
  { path: '', redirectTo: 'reserva', pathMatch: 'full' } 
];