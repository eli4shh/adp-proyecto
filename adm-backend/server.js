const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Cita = require('./models/Cita');
require('dotenv').config();

const app = express();

app.use(cors());         
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true })); 

// Rutas
const authRoutes = require('./routes/authRoutes');
const citaRoutes = require('./routes/citaRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/citas', citaRoutes);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/huellitas_db';

mongoose.connect(MONGO_URI)
  .then(() => console.log('🟢 Conectado exitosamente a MongoDB'))
  .catch(err => console.error('🔴 Error de conexión a MongoDB:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});