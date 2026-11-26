import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

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
        plugins: [react(), {
            name: 'offline-camera-scanner',
            configureServer(server) {
                server.middlewares.use('/scanner/opencv.js', (_req, res) => {
                    res.setHeader('Content-Type', 'application/javascript')
                    res.end(readFileSync(path.join(__dirname, 'node_modules/@techstark/opencv-js/dist/opencv.js')))
                })
            },
            generateBundle() {
                this.emitFile({ type: 'asset', fileName: 'scanner/opencv.js', source: readFileSync(path.join(__dirname, 'node_modules/@techstark/opencv-js/dist/opencv.js')) })
            }
        }],
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
