import { defineConfig } from 'vite'
const local = 'http://127.0.0.1:7071'
export default defineConfig({ server: { host: '127.0.0.1', proxy: {
  '/api': local, '/.auth': local, '/demo': local
} } })
