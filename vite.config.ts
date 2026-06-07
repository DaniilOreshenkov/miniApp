import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Разбивка на чанки для лучшего кэширования
    rollupOptions: {
      output: {
        manualChunks: {
          // React runtime — меняется редко, кэшируется надолго
          'vendor-react': ['react', 'react-dom'],
          // Иконки — отдельный чанк
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    // Предупреждение при чанке > 500KB
    chunkSizeWarningLimit: 500,
  },
})
