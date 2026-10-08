const mongoose = require('mongoose');

const CitaSchema = new mongoose.Schema({
  tutorNombre: { 
    type: String, 
    required: function() { return this.estado !== 'bloqueado_temporal'; } 
  },
  tutorDireccion: String,
  tutorCelular: { 
    type: String, 
    required: function() { return this.estado !== 'bloqueado_temporal'; } 
  },
  tutorCelular2: String,
  observaciones: String,
  petNombre: { 
    type: String, 
    required: function() { return this.estado !== 'bloqueado_temporal'; } 
  },
  petRaza: String,
  petEdad: String,
  petColor: String,
  petSexo: { type: String, enum: ['Macho', 'Hembra'], default: 'Macho' },
  petAlergias: String,
  petCondicionMedica: String,
  fecha: { type: String, required: true }, 
  hora: { type: String, required: true },  
  estado: { 
    type: String, 
    enum: ['bloqueado_temporal', 'pendiente', 'confirmada', 'cancelada'], 
    default: 'bloqueado_temporal' 
  },
  urlCaptura: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model('Cita', CitaSchema);