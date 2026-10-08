import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { Reserva } from '../interfaces/reserva';

@Injectable({
  providedIn: 'root'
})
export class ReservaService {

  private apiUrl = 'http://localhost:3000/api/citas';

  constructor(private http: HttpClient) { }

  // 0. Compatibilidad con el frontend actual (2 pasos en 1)
  crearReserva(reserva: Reserva): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/temporal`, { fecha: reserva.fecha, hora: reserva.hora }).pipe(
      switchMap(resTemp => {
        const citaId = resTemp.data._id;
        const { urlCaptura, ...datosCliente } = reserva;
        return this.http.post<any>(`${this.apiUrl}/formulario`, {
          citaId,
          base64Imagen: urlCaptura,
          ...datosCliente
        });
      })
    );
  }

  // 1. Bloqueo Temporal
  reservarHorarioTemporal(fecha: string, hora: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/temporal`, { fecha, hora });
  }

  // 2. Enviar formulario final (incluye imagen)
  enviarFormularioCliente(citaId: string, base64Imagen: string, datosCliente: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/formulario`, { citaId, base64Imagen, ...datosCliente });
  }

  // 2.5 Obtener horarios ocupados
  obtenerHorariosOcupados(fecha: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/horarios-ocupados?fecha=${fecha}`);
  }

  // General: Obtener todas las citas (protegido por interceptor si se accede logueado)
  obtenerReservas(): Observable<Reserva[]> {
    return this.http.get<Reserva[]>(this.apiUrl);
  }

  obtenerMetricas(fecha?: string): Observable<any> {
    let url = `${this.apiUrl}/metricas`;
    if (fecha) {
      url += `?fecha=${fecha}`;
    }
    return this.http.get<any>(url);
  }

  // Trabajador: Confirmar cita
  confirmarCita(id: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}/confirmar`, {});
  }

  // Trabajador: Cancelar cita
  cancelarCita(id: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}/cancelar`, {});
  }

  // Trabajador/Admin: Actualizar cita
  actualizarCita(id: string, datos: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, datos);
  }
}