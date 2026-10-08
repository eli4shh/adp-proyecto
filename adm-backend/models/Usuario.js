const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true
  },
  usuario: {
    type: String,
    required: true,
    unique: true
  },
  contrasenia: {
    type: String,
    required: true
  },
  rol: {
    type: String,
    enum: ['admin', 'trabajador'],
    required: true
  },
  cajaAcumulada: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Usuario', usuarioSchema);