const Cita = require('../models/Cita');
const Usuario = require('../models/Usuario');
const HistorialCaja = require('../models/HistorialCaja');
const cloudinary = require('../config/cloudinary');

// 1. Bloquear horario temporalmente
exports.reservarHorarioTemporal = async (req, res) => {
  try {
    const { fecha, hora } = req.body;

    const citaExistente = await Cita.findOne({
      fecha,
      hora,
      estado: { $ne: 'cancelada' }
    });

    if (citaExistente) {
      return res.status(400).json({ 
        success: false, 
        message: 'El horario seleccionado ya fue reservado por otro cliente en este momento. Por favor, elige otra hora o fecha.' 
      });
    }

    const nuevaCitaTemporal = new Cita({
      fecha,
      hora,
      estado: 'bloqueado_temporal',
      expiraEn: new Date(Date.now() + 10 * 60 * 1000) 
    });

    const citaGuardada = await nuevaCitaTemporal.save();

    res.status(201).json({
      mensaje: 'Horario bloqueado temporalmente por 10 minutos',
      data: citaGuardada
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al reservar el horario', error: error.message });
  }
};

// 2. Confirmar formulario por parte del cliente
exports.enviarFormularioCliente = async (req, res) => {
  try {
    const { citaId, base64Imagen, ...datosCliente } = req.body;

    const cita = await Cita.findById(citaId);
    if (!cita) {
      return res.status(404).json({ mensaje: 'Reserva temporal no encontrada o ya expiró.' });
    }

    if (cita.estado !== 'bloqueado_temporal') {
      return res.status(400).json({ mensaje: 'Esta cita ya fue procesada anteriormente.' });
    }

    let urlCaptura = "";

    if (base64Imagen) {
      const uploadResponse = await cloudinary.uploader.upload(base64Imagen, {
        folder: 'huellitas_vouchers'
      });
      urlCaptura = uploadResponse.secure_url;
    }

    Object.assign(cita, datosCliente);
    cita.urlCaptura = urlCaptura;
    cita.estado = 'pendiente';
    
    await cita.save();

    res.json({
      mensaje: 'Formulario enviado correctamente. Esperando confirmación del personal.',
      data: cita
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al enviar el formulario', error: error.message });
  }
};

// 2.5 Obtener horarios ocupados (Público)
exports.obtenerHorariosOcupados = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ mensaje: 'Fecha es requerida' });
    
    const citas = await Cita.find({ fecha, estado: { $ne: 'cancelada' } }).select('hora estado');
    return res.status(200).json(citas);
  } catch (error) {
    return res.status(500).json({ mensaje: 'Error al obtener horarios ocupados', error: error.message });
  }
};

// 3. Obtener todas las citas (Admin/Trabajador)
exports.obtenerCitas = async (req, res) => {
  try {
    const citas = await Cita.find().sort({ fecha: 1, hora: 1 });
    return res.status(200).json(citas);
  } catch (error) {
    return res.status(500).json({ mensaje: 'Error al obtener las citas', error: error.message });
  }
};

// 4. Confirmar cita por el trabajador
exports.confirmarCitaTrabajador = async (req, res) => {
  try {
    const { id } = req.params;
    const trabajadorId = req.usuario._id; 

    // Validación estricta de rol para evitar que un admin sume a su caja personal
    const usuarioEjecutor = await Usuario.findById(trabajadorId);
    if (usuarioEjecutor && usuarioEjecutor.rol === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Operación denegada. Los administradores no pueden recaudar adelantos en su caja personal desde el panel de trabajadores.'
      });
    }
    
    const cita = await Cita.findById(id);
    if (!cita) {
      return res.status(404).json({ mensaje: 'Cita no encontrada.' });
    }

    if (cita.estado === 'confirmada') {
      return res.status(400).json({ mensaje: 'Esta cita ya fue confirmada previamente.' });
    }

    cita.estado = 'confirmada';

    await cita.save();

    await Usuario.findByIdAndUpdate(trabajadorId, {
      $inc: { cajaAcumulada: 10 }
    });

    res.json({ mensaje: 'Cita confirmada y S/. 10 sumados a la caja.', data: cita });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al confirmar la cita', error: error.message });
  }
};

// 4.5 Obtener citas pendientes (Trabajador)
exports.obtenerCitasPendientes = async (req, res) => {
  try {
    const citas = await Cita.find({ estado: 'pendiente' }).sort({ fecha: 1, hora: 1 });
    return res.status(200).json(citas);
  } catch (error) {
    return res.status(500).json({ mensaje: 'Error al obtener las citas pendientes', error: error.message });
  }
};

// 5. Obtener métricas (Admin)
exports.obtenerMetricasDia = async (req, res) => {
  try {
    let fechaFiltro = req.query.fecha;
    if (!fechaFiltro) {
      fechaFiltro = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    }

    // 1. Obtener todas las citas para el día actual
    const citasHoy = await Cita.find({ fecha: fechaFiltro });
    
    // Contar confirmadas para hoy
    let confirmadasHoy = 0;
    
    citasHoy.forEach(c => {
      if (c.estado === 'confirmada') confirmadasHoy++;
    });

    const totalIngresosHoy = confirmadasHoy * 10;

    // 2. Obtener todas las citas para el mes
    const [year, month] = fechaFiltro.split('-');
    const regexMes = new RegExp(`^${year}-${month}-`);
    const citasMes = await Cita.find({ fecha: { $regex: regexMes } });
    
    let confirmadasMes = 0;
    citasMes.forEach(c => {
      if (c.estado === 'confirmada') confirmadasMes++;
    });
    
    const totalIngresosMes = confirmadasMes * 10;

    // 3. Contar todas las citas pendientes y canceladas globales
    const totalPendientes = await Cita.countDocuments({ estado: 'pendiente' });
    const totalCanceladas = await Cita.countDocuments({ estado: 'cancelada' });

    const metricas = {
      fecha: fechaFiltro,
      statsCitas: [
        { _id: 'confirmada', count: confirmadasHoy },
        { _id: 'pendiente', count: totalPendientes },
        { _id: 'cancelada', count: totalCanceladas }
      ],
      statsMes: [
        { _id: 'confirmada', count: confirmadasMes }
      ],
      cajaTrabajadores: 0,
      ingresosDiarios: totalIngresosHoy,
      ingresosMensuales: totalIngresosMes
    };

    res.json(metricas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener las métricas', error: error.message });
  }
};

// 6. Cancelar cita
exports.cancelarCitaTrabajador = async (req, res) => {
  try {
    const { id } = req.params;
    const cita = await Cita.findById(id);
    if (!cita) {
      return res.status(404).json({ mensaje: 'Cita no encontrada.' });
    }
    
    if (cita.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: 'Esta reserva ya fue actualizada (confirmada o cancelada) por otro usuario. La pantalla se actualizará automáticamente.'
      });
    }

    cita.estado = 'cancelada';
    
    await cita.save();

    return res.status(200).json({ mensaje: 'Cita cancelada correctamente.', data: cita });
  } catch (error) {
    return res.status(500).json({ mensaje: 'Error al cancelar la cita', error: error.message });
  }
};

// 7. Actualizar cita (Ojito/Edición)
exports.actualizarCita = async (req, res) => {
  try {
    const { id } = req.params;
    const { petAlergias, petCondicionMedica, observaciones, fecha, hora, estado } = req.body;
    
    const cita = await Cita.findById(id);
    if (!cita) {
      return res.status(404).json({ mensaje: 'Cita no encontrada.' });
    }

    if (petAlergias !== undefined) cita.petAlergias = petAlergias;
    if (petCondicionMedica !== undefined) cita.petCondicionMedica = petCondicionMedica;
    if (observaciones !== undefined) cita.observaciones = observaciones;
    
    // Si se reprograma o se cambia estado
    if (fecha !== undefined) cita.fecha = fecha;
    if (hora !== undefined) cita.hora = hora;
    if (estado !== undefined) cita.estado = estado;

    await cita.save();

    return res.status(200).json({ mensaje: 'Cita actualizada correctamente.', data: cita });
  } catch (error) {
    return res.status(500).json({ mensaje: 'Error al actualizar la cita', error: error.message });
  }
};

