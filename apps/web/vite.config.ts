import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@projeto-saas/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-tanstack': ['@tanstack/react-query', '@tanstack/react-table'],
          'vendor-ui': ['lucide-react', '@radix-ui/react-slot', '@radix-ui/react-tooltip', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    // Por padrao o Vite escuta so em localhost, o que bloqueia o acesso pela
    // rede (Radmin VPN, LAN, celular). host:true faz o servidor escutar em
    // todas as interfaces (0.0.0.0).
    host: true,
    // Radmin VPN exige porta fixa: sem strictPort o Vite trocaria para 5174
    // quando a 5173 estivesse ocupada e o endereco da VPN quebraria.
    port: 5173,
    strictPort: true,
    // Sem isto o Vite recusa requisicoes cujo cabecalho Host nao seja
    // localhost/IP conhecido ("Blocked request. This host is not allowed.").
    allowedHosts: true,
    // O proxy resolve '/api' para a API local, evitando CORS no navegador:
    // o front chama o mesmo host/porta de onde foi aberto.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    // Pastas de build e mídia NÃO podem ser observadas: um .mp4 bloqueado pelo
    // Windows (ex.: cópia dist-verify/) faz o chokidar lançar EBUSY e DERRUBA o
    // dev server inteiro. Ignorar aqui impede qualquer recorrência.
    watch: {
      ignored: [
        '**/dist/**',
        '**/dist-verify/**',
        '**/*.mp4',
        '**/vite.config.ts.timestamp-*.mjs',
      ],
    },
  },
});
