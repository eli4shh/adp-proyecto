const express = require('express');
const router = express.Router();
const citaController = require('../controllers/citaController');
const auth = require('../middlewares/authMiddleware');

// Cliente: Bloquear horario temporal (10 min)
router.post('/temporal', citaController.reservarHorarioTemporal);

// Cliente: Enviar el formulario final con voucher (Base64)
router.post('/formulario', citaController.enviarFormularioCliente);

// Cliente: Obtener horarios ocupados (Público)
router.get('/horarios-ocupados', citaController.obtenerHorariosOcupados);

// General: Obtener citas (Protegido)
router.get('/', auth, citaController.obtenerCitas);

// Trabajador: Obtener citas pendientes de hoy (Protegido)
router.get('/pendientes', auth, citaController.obtenerCitasPendientes);

// Admin: Obtener metricas (Protegido)
router.get('/metricas', auth, citaController.obtenerMetricasDia);

// Trabajador: Confirmar cita (Pasar de pendiente a confirmada, suma S/. 10 a caja) (Protegido)
router.put('/:id/confirmar', auth, citaController.confirmarCitaTrabajador);

// Trabajador: Cancelar cita (Protegido)
router.put('/:id/cancelar', auth, citaController.cancelarCitaTrabajador);

// Trabajador/Admin: Actualizar cita (Ojito/Edición)
router.put('/:id', auth, citaController.actualizarCita);

module.exports = router;