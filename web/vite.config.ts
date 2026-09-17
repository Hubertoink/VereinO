import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  // Shared renderer files sit outside web/ and have no parent tsconfig in Docker.
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { exclude: ['pdfjs-dist'] },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'pdfjs-dist': fileURLToPath(new URL('./node_modules/pdfjs-dist', import.meta.url)),
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
      '@tabler/icons-react': fileURLToPath(
        new URL('./node_modules/@tabler/icons-react', import.meta.url)
      )
    }
  },
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    proxy: { '/api': process.env.VEREINO_API_URL || 'http://127.0.0.1:3000' }
  }
})
