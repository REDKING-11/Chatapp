import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_CORE_API_BASE;

  return {
    server: {
      proxy: {
        '/__core_api__': {
          target,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/__core_api__/, ''),
        },
      },
    },
  };
});
