import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'dist-electron/main',
            lib: {
                entry: {
                    index: path.resolve(__dirname, 'electron/main/index.ts'),
                    backupIo: path.resolve(__dirname, 'electron/main/workers/backupIo.ts')
                },
                fileName: (_format, entryName) => `${entryName}.cjs`,
                formats: ['cjs'],
            },
            rollupOptions: {
                external: ['electron']
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'dist-electron/preload',
            lib: {
                entry: path.resolve(__dirname, 'electron/preload/index.ts'),
                formats: ['cjs']
            },
            rollupOptions: {
                external: ['electron']
            }
        }
    },
    renderer: {
        plugins: [react()],
        build: {
            outDir: 'dist',
            rollupOptions: {
                input: path.resolve(__dirname, 'src/renderer/index.html')
            }
        },
        resolve: {
            alias: {
                '@main': path.resolve(__dirname, 'electron/main'),
                '@preload': path.resolve(__dirname, 'electron/preload'),
                '@renderer': path.resolve(__dirname, 'src'),
                '@shared': path.resolve(__dirname, 'shared')
            }
        },
        server: {
            port: 5173
        }
    }
})
