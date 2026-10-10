const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Cargar .env principal
const envPath = path.resolve(__dirname, '../.env');
const envLocalPath = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Permitir sobreescritura con .env.local si existe
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

// Si FORZAR_MOCK viene explícito en .env se respeta; de lo contrario si no hay credenciales se fuerza mock
const forzarMockEnv = process.env.FORZAR_MOCK !== undefined 
  ? process.env.FORZAR_MOCK === 'true'
  : (!supabaseUrl || !supabaseKey);

const environmentsDir = path.resolve(__dirname, '../src/environments');

if (!fs.existsSync(environmentsDir)) {
  fs.mkdirSync(environmentsDir, { recursive: true });
}

const devConfigFile = `import type { Environment } from './environment.types';

export const environment: Environment = {
  production: false,
  forzarMock: ${forzarMockEnv},
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}'
};
`;

const prodConfigFile = `import type { Environment } from './environment.types';

export const environment: Environment = {
  production: true,
  forzarMock: ${process.env.FORZAR_MOCK === 'true'},
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}'
};
`;

const devPath = path.join(environmentsDir, 'environment.development.ts');
const prodPath = path.join(environmentsDir, 'environment.ts');

fs.writeFileSync(devPath, devConfigFile, 'utf8');
fs.writeFileSync(prodPath, prodConfigFile, 'utf8');

console.log('✅ [set-env] Archivos de entorno generados exitosamente desde .env:');
console.log(`   - ${devPath}`);
console.log(`   - ${prodPath}`);
if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  [set-env] Advertencia: SUPABASE_URL o SUPABASE_KEY están vacíos.');
}
