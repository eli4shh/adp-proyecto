# ADM App — Sistema Inteligente de Planificación, Contratación y Evaluación de Servicios Externos

Frontend desarrollado en **Angular 21** (Standalone Components) con integración a **Supabase** (PostgreSQL, Auth y RLS).

---

## 🚀 Módulos y Rutas Principales

- `/postulacion` (Pública): Formulario de postulación y presentación de cotizaciones para proveedores.
- `/login` (Pública): Acceso corporativo para el equipo de compras y administración.
- `/bandeja` (Protegida): Bandeja centralizada de solicitudes de cotización recibidas.
- `/evaluacion` (Protegida): Módulo de evaluación multicriterio, ponderación y adjudicación de contratos.

---

## 🛠️ Tecnologías

- **Framework:** Angular 21 (Standalone Components)
- **Lenguaje:** TypeScript 5.9
- **Estilos:** CSS3 / Vanilla CSS con variables de diseño corporativo (Inter & JetBrains Mono)
- **Base de Datos & Auth:** Supabase (`@supabase/supabase-js`) con modo Mock fallback automático
- **Alertas y Notificaciones:** SweetAlert2

---

## ⚙️ Configuración y Desarrollo

### 1. Variables de Entorno
Copia el archivo `.env.example` a `.env` y define tus credenciales de Supabase:
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key
FORZAR_MOCK=false
```
> *Nota: Si no defines credenciales, la aplicación se ejecutará automáticamente en modo Mock con datos de prueba.*

### 2. Iniciar Servidor de Desarrollo
```bash
npm start
# o
ng serve
```
La aplicación estará disponible en `http://localhost:4200/`.

### 3. Compilación de Producción
```bash
npm run build
```
