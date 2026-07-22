const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Obtener el token del header Authorization (Bearer token)
  const authHeader = req.header('Authorization'); console.log('Auth header:', authHeader);
  if (!authHeader) {
    return res.status(401).json({ mensaje: 'Acceso denegado. No hay token.' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.usuario = verified; // { _id, nombre, rol, ... }
    next();
  } catch (err) {
    res.status(400).json({ mensaje: 'Token inválido.' });
  }
};