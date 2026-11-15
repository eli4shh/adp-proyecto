const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

const envFileContent = `export const env = {
  SUPABASE_URL: '${supabaseUrl}',
  SUPABASE_KEY: '${supabaseKey}'
};
`;

const targetPath = path.resolve(__dirname, '../src/env.ts');
fs.writeFileSync(targetPath, envFileContent, 'utf8');

console.log('✅ [set-env] Archivo src/env.ts generado desde .env');
if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  [set-env] Advertencia: SUPABASE_URL o SUPABASE_KEY no definidos en .env');
}
