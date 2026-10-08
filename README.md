# Sistema de Gestión y Citas - Peluquería Canina

Aplicación web monolítica bajo estructura **Monorepo** para la gestión integral de reservas, control operativo de agenda y manejo de caja chica para una peluquería canina.

---

## 🏗️ Estructura del Proyecto

Este repositorio utiliza una arquitectura de **Monorepo**:

```text
adp-proyectos/
├── 📁 adm-app/        # Frontend desarrollado en Angular 21
└── 📁 adm-backend/    # Backend desarrollado en Node.js, Express y MongoDB Atlas
```

---

## 🛠️ Tech Stack

| Capa | Tecnología / Herramientas |
| :--- | :--- |
| **Frontend** | Angular 21 (Standalone Components), TypeScript, HTML5, CSS3 |
| **Seguridad Frontend** | Interceptores HTTP y Guardias de Ruta (Guards JWT) |
| **Backend** | Node.js, Express.js |
| **Base de Datos** | MongoDB Atlas (Mongoose ORM) |
| **Autenticación** | JSON Web Tokens (JWT) & bcrypt.js |
| **Almacenamiento Media** | Cloudinary API |

---

## 👥 Roles y Funcionalidades del Sistema

* 🐶 **Cliente:**
  * Reserva de citas en línea.
  * Selección de horarios con bloqueo temporal.
  * Carga y subida de comprobantes de pago.

* ✂️ **Trabajador (Recepción):**
  * Panel operativo para confirmar o cancelar citas.
  * Actualización de fichas médicas de las mascotas.
  * Registro y control del cierre de caja chica.

* 👑 **Administrador:**
  * Dashboard con métricas clave de rendimiento.
  * Conteo de ingresos diarios y mensuales.
  * Ranking de razas atendidas y reporte estadístico.
  * Gestión integral de personal y usuarios.

---

## ⚙️ Configuración e Instalación Local

### 1. Clonar el repositorio
```bash
git clone [https://github.com/eli4shh/adp-proyecto.git](https://github.com/eli4shh/adp-proyecto.git)
cd adp-proyecto
```

### 2. Configurar y levantar el Backend

```bash
# Navegar a la carpeta del backend e instalar dependencias
cd adm-backend
npm install
```

> ⚠️ **Nota:** Crea un archivo `.env` dentro de la carpeta `adm-backend` basándote en el archivo `.env.example`.

Inicia el servidor en modo desarrollo:
```bash
npm start
# Servidor corriendo en http://localhost:3000
```

### 3. Configurar y levantar el Frontend

Abre una nueva terminal en la raíz del proyecto y ejecuta:

```bash
# Navegar a la carpeta del frontend e instalar dependencias
cd adm-app
npm install

# Iniciar la aplicación
ng serve
# Aplicación disponible en http://localhost:4200
```
