const mongoose = require('mongoose');

const HistorialCajaSchema = new mongoose.Schema({
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  monto: { type: Number, required: true },
  fecha: { type: String, required: true } // YYYY-MM-DD
}, { timestamps: true });

module.exports = mongoose.model('HistorialCaja', HistorialCajaSchema);
