const Usuario = require('../models/Usuario');
const HistorialCaja = require('../models/HistorialCaja');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Registro de usuario inicial (Admin u otros)
exports.register = async (req, res) => {
  try {
    const { nombre, usuario, contrasenia, rol } = req.body;

    // Verificar si el usuario ya existe
    const usuarioExistente = await Usuario.findOne({ usuario });
    if (usuarioExistente) {
      return res.status(400).json({ mensaje: 'El usuario ya existe' });
    }

    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const contraseniaHasheada = await bcrypt.hash(contrasenia, salt);

    // Crear el nuevo usuario
    const nuevoUsuario = new Usuario({
      nombre,
      usuario,
      contrasenia: contraseniaHasheada,
      rol: rol || 'trabajador' // default
    });

    const usuarioGuardado = await nuevoUsuario.save();

    res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      data: {
        _id: usuarioGuardado._id,
        nombre: usuarioGuardado.nombre,
        usuario: usuarioGuardado.usuario,
        rol: usuarioGuardado.rol
      }
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al registrar usuario', error: error.message });
  }
};

// Autenticación (Login)
exports.login = async (req, res) => {
  try {
    const { usuario, contrasenia } = req.body;

    // Buscar el usuario
    const user = await Usuario.findOne({ usuario });
    if (!user) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // Verificar la contraseña
    const contraseniaValida = await bcrypt.compare(contrasenia, user.contrasenia);
    if (!contraseniaValida) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    // Generar el token JWT
    const token = jwt.sign(
      { _id: user._id, nombre: user.nombre, rol: user.rol },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        _id: user._id,
        nombre: user.nombre,
        rol: user.rol,
        cajaAcumulada: user.cajaAcumulada
      }
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};

// Cerrar caja
exports.cerrarCaja = async (req, res) => {
  try {
    const userId = req.usuario._id;
    
    const user = await Usuario.findById(userId);
    if (!user) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const totalRendido = user.cajaAcumulada;

    if (totalRendido > 0) {
      const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      const fechaFiltro = hoyStr; // YYYY-MM-DD

      const nuevoHistorial = new HistorialCaja({
        usuarioId: user._id,
        monto: totalRendido,
        fecha: fechaFiltro
      });
      await nuevoHistorial.save();
    }

    // Resetear a 0
    user.cajaAcumulada = 0;
    await user.save();

    res.status(200).json({
      success: true,
      mensaje: 'Caja cerrada exitosamente.',
      totalRendido: totalRendido
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al cerrar caja', error: error.message });
  }
};

// Obtener lista de trabajadores (Para el Admin)
exports.getTrabajadores = async (req, res) => {
  try {
    const trabajadores = await Usuario.find({ rol: 'trabajador' }).select('-contrasenia');
    res.json(trabajadores);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener trabajadores', error: error.message });
  }
};

// Eliminar trabajador (Para el Admin)
exports.eliminarTrabajador = async (req, res) => {
  try {
    const { id } = req.params;
    const trabajadorEliminado = await Usuario.findByIdAndDelete(id);
    if (!trabajadorEliminado) {
      return res.status(404).json({ mensaje: 'Trabajador no encontrado' });
    }
    res.json({ mensaje: 'Trabajador eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar trabajador', error: error.message });
  }
};