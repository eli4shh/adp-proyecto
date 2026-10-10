# 📋 Sistema Inteligente de Planificación, Contratación y Evaluación de Servicios Externos

Plataforma corporativa para la gestión de contrataciones públicas/privadas, recepción de postulaciones y cotizaciones de proveedores, evaluación multicriterio, ponderación de ofertas y adjudicación de contratos.

---

## 🏗️ Estructura del Proyecto

El repositorio contiene la aplicación frontend principal y los esquemas de base de datos relacionales:

```text
admproyecto-final/
├── adm-app/               # Aplicación web desarrollada en Angular 21 (Standalone Components)
├── supabase_schema.sql    # Esquema relacional de base de datos PostgreSQL en Supabase (RLS, tablas y roles)
└── README.md              # Documentación general del proyecto
```

---

## 🛠️ Stack Tecnológico

### **Frontend (`adm-app`)**
- **Framework:** Angular 21 (Componentes Standalone, Signals)
- **Lenguaje:** TypeScript 5.9
- **Estilos:** CSS3 / Diseño corporativo responsivo (Inter y JetBrains Mono, Google Material Symbols)
- **Gestión de Estado y Reactividad:** RxJS y Angular Signals
- **Integración Backend / DB:** `@supabase/supabase-js` con modo Mock fallback automático
- **Alertas y Confirmaciones:** SweetAlert2

### **Base de Datos & Seguridad (`supabase_schema.sql`)**
- **Motor:** PostgreSQL (Supabase)
- **Seguridad:** Row Level Security (RLS) para aislamiento de datos entre proveedores y administradores
- **Autenticación:** Supabase Auth (JWT)

---

## ⚙️ Instalación y Ejecución Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/eli4shh/huellitas-pet-project.git
cd admproyecto-final
```

### 2. Configurar y levantar el Frontend
```bash
cd adm-app
npm install
```

#### Variables de Entorno:
Crea o edita el archivo `.env` dentro de la carpeta `adm-app`:
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key
FORZAR_MOCK=false
```
> **Nota:** Si no dispones de credenciales de Supabase de inmediato, puedes dejar `FORZAR_MOCK=true` o dejar las variables vacías. La app se ejecutará con datos simulados y completos para pruebas de interfaz.

Inicia el servidor en modo desarrollo:
```bash
npm start
# o
ng serve
```
La aplicación estará disponible en: [http://localhost:4200](http://localhost:4200)

---

## 👥 Módulos y Roles del Sistema

- **Portal de Proveedores (`/postulacion`):**
  - Registro de datos de la empresa (RUC/DNI, razón social, rubro, contacto).
  - Carga de cotizaciones y propuestas técnicas/económicas.
  - Validación de campos y confirmación inmediata.

- **Acceso Interno (`/login`):**
  - Autenticación segura para el equipo de administración y compras mediante Supabase Auth.

- **Bandeja de Cotizaciones (`/bandeja`):**
  - Control de solicitudes recibidas, estados de revisión y filtrado.
  - Gestión del ciclo de vida de cada solicitud.

- **Evaluación y Adjudicación (`/evaluacion`):**
  - Matriz de evaluación multicriterio (técnica, económica, experiencia).
  - Ponderación automatizada y cálculo de puntajes.
  - Selección de ganador y adjudicación de contrato.
