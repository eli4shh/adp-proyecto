import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { SunatService } from './sunat.service';

describe('SunatService', () => {
  let service: SunatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SunatService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(SunatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('debe retornar null para RUCs inválidos o que no empiecen en 20', () => {
    let resultado: any = undefined;
    service.consultarRuc('10456789012').subscribe((res) => (resultado = res));
    expect(resultado).toBeNull();

    service.consultarRuc('123').subscribe((res) => (resultado = res));
    expect(resultado).toBeNull();
  });

  it('debe consultar OpenRUC exitosamente para RUC 20 válido', () => {
    let resultado: any;
    service.consultarRuc('20100047218').subscribe((res) => {
      resultado = res;
    });

    const req = httpMock.expectOne('https://openruc.com/api/ruc/20100047218');
    expect(req.request.method).toBe('GET');
    req.flush({
      ruc: '20100047218',
      razon_social: 'BANCO DE CREDITO DEL PERU',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
      direccion: 'JR. CENTENARIO NRO 156',
      ubigeo: '150114'
    });

    expect(resultado).toBeTruthy();
    expect(resultado.razon_social).toBe('BANCO DE CREDITO DEL PERU');
    expect(resultado.estado).toBe('ACTIVO');
  });

  it('debe recurrir a datos semilla locales si falla la red para RUCs conocidos del proyecto', () => {
    let resultado: any;
    service.consultarRuc('20123456789').subscribe((res) => {
      resultado = res;
    });

    const req = httpMock.expectOne('https://openruc.com/api/ruc/20123456789');
    req.error(new ProgressEvent('Network error'));

    expect(resultado).toBeTruthy();
    expect(resultado.razon_social).toBe('AquaClean Piscinas S.A.C.');
    expect(resultado.estado).toBe('ACTIVO');
  });
});

