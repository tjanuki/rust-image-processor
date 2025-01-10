// www/vite.config.js
export default {
  server: {
    port: 3000,
    fs: {
      // Allow serving files from one level up the project root
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
    // Enable WebAssembly support
    wasm: true
  },
  optimizeDeps: {
    // Exclude WASM files from dependency optimization
    exclude: ['../pkg/image_processor_bg.wasm']
  }
}