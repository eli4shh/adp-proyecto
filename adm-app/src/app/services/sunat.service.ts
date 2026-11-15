import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface SunatRucResponse {
  ruc: string;
  razon_social: string;
  estado: string;
  condicion: string;
  direccion?: string;
  ubigeo?: string;
  source?: string;
  as_of?: string;
}

const MOCK_RUCS: Record<string, { razon_social: string; direccion: string; ubigeo: string }> = {
  '20123456789': { razon_social: 'AquaClean Piscinas S.A.C.', direccion: 'Av. Industrial 1234', ubigeo: '150101' },
  '20234567890': { razon_social: 'VigilPro Perú S.R.L.', direccion: 'Av. Los Próceres 456', ubigeo: '150114' },
  '20345678901': { razon_social: 'Jardines del Sol E.I.R.L.', direccion: 'Jr. Las Flores 789', ubigeo: '150130' },
  '20456789012': { razon_social: 'Sabor & Servicio Catering S.A.C.', direccion: 'Av. Primavera 102', ubigeo: '150140' },
  '20567890123': { razon_social: 'ClimaTotal HVAC S.R.L.', direccion: 'Av. Argentina 890', ubigeo: '150101' },
  '20678901234': { razon_social: 'AquaTotal Pool Service S.A.C.', direccion: 'Calle Las Begonias 331', ubigeo: '150131' },
  '20789012345': { razon_social: 'Catering del País S.R.L.', direccion: 'Av. Javier Prado Este 2200', ubigeo: '150141' },
  '20890123456': { razon_social: 'Grupo Eventos Iquitos S.A.C.', direccion: 'Jr. Próspero 450', ubigeo: '160101' }
};

@Injectable({
  providedIn: 'root'
})
export class SunatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'https://openruc.com/api/ruc';

  /**
   * Consulta pública en OpenRUC (SUNAT legal entities - RUC 20).
   * Si la API retorna datos, se usan los datos oficiales.
   * Si es un RUC semilla del proyecto o hay fallo de red, usa el mock respaldado.
   */
  consultarRuc(ruc: string): Observable<SunatRucResponse | null> {
    const cleanRuc = (ruc || '').trim();
    if (!/^\d{11}$/.test(cleanRuc) || !cleanRuc.startsWith('20')) {
      return of(null);
    }

    return this.http.get<SunatRucResponse>(`${this.apiUrl}/${cleanRuc}`).pipe(
      map((res) => {
        if (res && res.ruc && res.razon_social) {
          return res;
        }
        return this.obtenerMock(cleanRuc);
      }),
      catchError(() => of(this.obtenerMock(cleanRuc)))
    );
  }

  private obtenerMock(cleanRuc: string): SunatRucResponse | null {
    const mock = MOCK_RUCS[cleanRuc];
    if (mock) {
      return {
        ruc: cleanRuc,
        razon_social: mock.razon_social,
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        direccion: mock.direccion,
        ubigeo: mock.ubigeo,
        source: 'SUNAT (Semilla Local)'
      };
    }
    return null;
  }
}
