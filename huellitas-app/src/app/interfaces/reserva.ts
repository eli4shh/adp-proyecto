export interface Reserva {
  _id?: string;

  tutorNombre: string;
  tutorDireccion: string;
  tutorCelular: string;
  tutorCelular2?: string; 

  notas?: string; 

  petNombre: string;
  petRaza: string;
  petEdad: string;
  petColor: string;
  petSexo: 'Macho' | 'Hembra';
  petAlergias?: string; 
  petCondicionMedica?: string; 

  observaciones?: string;

  fecha: string; 
  hora: string;  
  estado: 'pendiente' | 'confirmada' | 'cancelada';

  urlCaptura?: string;
}