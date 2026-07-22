Set-Content -Path ".\README.md" -Value "# 🐾 Huellitas Pet Grooming — Sistema de Gestión y Citas

Aplicación web monolítica en estructura Monorepo para la gestión integral de reservas, control operativo de agenda y caja chica de una peluquería canina.

---

## 🏗️ Estructura del Proyecto

This repository is structured as a **Monorepo**:

\`\`\`text
huellitas_vs1/
├── huellitas-app/        # Frontend desarrollado en Angular 21
└── huellitas-backend/    # Backend desarrollado en Node.js, Express y MongoDB Atlas
\`\`\`

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework:** Angular 21 (Standalone Components)
- **Lenguaje:** TypeScript
- **Estilos:** CSS3 / HTML5
- **Comunicación HTTP:** Interceptores y Guardias de ruta JWT

### **Backend**
- **Entorno de ejecución:** Node.js + Express
- **Base de Datos:** MongoDB Atlas (Mongoose ORM)
- **Autenticación:** JSON Web Tokens (JWT) & bcrypt
- **Almacenamiento de Multimedia:** Cloudinary API

---

## ⚙️ Configuración e Instalación Local

### 1. Clonar el repositorio
\`\`\`bash
git clone https://github.com/eli4shh/huellitas-pet-project.git
cd huellitas-pet-project
\`\`\`

### 2. Configurar y levantar el Backend
\`\`\`bash
cd huellitas-backend
npm install
\`\`\`
> **Nota:** Crea un archivo \`.env\` en la carpeta \`huellitas-backend\` guiándote del archivo \`.env.example\` provisto.

Inicia el servidor en modo desarrollo:
\`\`\`bash
npm start
# Servidor corriendo en http://localhost:3000
\`\`\`

### 3. Configurar y levantar el Frontend
En otra terminal:
\`\`\`bash
cd huellitas-app
npm install
ng serve
# Aplicación web disponible en http://localhost:4200
\`\`\`

---

## 👥 Roles del Sistema

- **Cliente:** Reserva de citas online, selección de horario con bloqueo temporal y carga de comprobante.
- **Trabajador:** Panel de recepción para confirmar/cancelar citas, actualización de ficha médica y cierre de caja chica.
- **Administrador:** Métricas de rendimiento, conteo de ingresos diarios/mensuales, ranking de razas y gestión de personal."
