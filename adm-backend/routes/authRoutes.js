const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/authMiddleware');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/cerrar-caja (Protegido)
router.post('/cerrar-caja', auth, authController.cerrarCaja);

// GET /api/auth/trabajadores (Protegido - Idealmente solo admin, pero usamos auth base)
router.get('/trabajadores', auth, authController.getTrabajadores);

// DELETE /api/auth/trabajadores/:id (Protegido)
router.delete('/trabajadores/:id', auth, authController.eliminarTrabajador);

module.exports = router;