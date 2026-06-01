import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const loginOtpApiPlugin = () => ({
  name: 'SucessKart-login-otp-api',
  configureServer(server) {
    let handlerPromise = null;

    server.middlewares.use('/api/login-otp', async (req, res, next) => {
      try {
        if (!handlerPromise) {
          handlerPromise = import('./api/login-otp.js').then((module) => module.default);
        }
        const handler = await handlerPromise;
        await handler(req, res);
      } catch (error) {
        next(error);
      }
    });
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), loginOtpApiPlugin()],
  };
})
