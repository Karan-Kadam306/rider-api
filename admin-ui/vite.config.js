import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // Bind to IPv4 explicitly; on Windows Vite otherwise listens only on ::1,
        // and browsers that resolve localhost to 127.0.0.1 can't connect.
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        // Forward API calls to the Express server so the browser sees one origin.
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
});
