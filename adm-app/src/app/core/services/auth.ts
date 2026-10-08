import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface User {
  _id: string;
  nombre: string;
  usuario: string;
  rol: 'admin' | 'trabajador';
  cajaAcumulada: number;
}

export interface AuthResponse {
  mensaje: string;
  token: string;
  usuario: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api/auth';

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.loadUserFromStorage();
  }

  private loadUserFromStorage() {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      this.currentUserSubject.next(JSON.parse(userJson));
    }
  }

  login(usuario: string, contrasenia: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { usuario, contrasenia }).pipe(
      tap(response => {
        if (response.token && response.usuario) {
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.usuario));
          this.currentUserSubject.next(response.usuario);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getRole(): string | null {
    return this.currentUserSubject.value?.rol || null;
  }

  cerrarCaja(): Observable<{ mensaje: string, totalRendido: number }> {
    return this.http.post<{ mensaje: string, totalRendido: number }>(
      `${this.apiUrl}/cerrar-caja`, 
      {}
    ).pipe(
      tap(() => {
        // Actualizar el estado local para reflejar que la caja está en 0
        const currentUser = this.currentUserSubject.value;
        if (currentUser) {
          const updatedUser = { ...currentUser, cajaAcumulada: 0 };
          localStorage.setItem('user', JSON.stringify(updatedUser));
          this.currentUserSubject.next(updatedUser);
        }
      })
    );
  }

  // --- MÉTODOS DE ADMIN ---
  getTrabajadores(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/trabajadores`);
  }

  registrarTrabajador(datos: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, datos);
  }

  eliminarTrabajador(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/trabajadores/${id}`);
  }
}
