/**
 * Dashboard Express server
 */

import express, { Application } from 'express';
import cors from 'cors';
import path from 'path';
import { createBasicAuthMiddleware } from './middleware/auth';
import { healthRoutes, statsRoutes, redemptionsRoutes, liquidationsRoutes } from './routes';
import { createLogger } from '../utils/logger';

const logger = createLogger('dashboard-server');

export interface DashboardServerConfig {
    port: number;
    username: string;
    password: string;
}

/**
 * Create the Express application
 */
export function createDashboardApp(config: DashboardServerConfig): Application {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Basic auth for API routes
    const authMiddleware = createBasicAuthMiddleware({
        username: config.username,
        password: config.password,
    });

    // API routes (protected)
    app.use('/api/health', authMiddleware, healthRoutes);
    app.use('/api/stats', authMiddleware, statsRoutes);
    app.use('/api/redemptions', authMiddleware, redemptionsRoutes);
    app.use('/api/liquidations', authMiddleware, liquidationsRoutes);

    // Serve React SPA in production
    const staticPath = path.join(__dirname, '../../dashboard-ui/dist');
    app.use(express.static(staticPath));

    // SPA fallback - serve index.html for all non-API routes
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        res.sendFile(path.join(staticPath, 'index.html'), (err) => {
            if (err) {
                // If index.html doesn't exist, return a helpful message
                res.status(200).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Market Maker Dashboard</title></head>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                        <h1>Market Maker Dashboard</h1>
                        <p>The dashboard UI is not built yet.</p>
                        <p>API endpoints are available at:</p>
                        <ul style="list-style: none; padding: 0;">
                            <li><code>/api/health</code></li>
                            <li><code>/api/stats?period=7d</code></li>
                            <li><code>/api/redemptions?period=7d</code></li>
                            <li><code>/api/liquidations?period=7d</code></li>
                        </ul>
                        <p><small>Use Basic Auth with your configured credentials.</small></p>
                    </body>
                    </html>
                `);
            }
        });
    });

    return app;
}

/**
 * Start the dashboard server
 */
export function startDashboardServer(config: DashboardServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        const app = createDashboardApp(config);

        const server = app.listen(config.port, () => {
            logger.info(`Dashboard server started on http://localhost:${config.port}`);
            resolve();
        });

        server.on('error', (error) => {
            logger.error('Failed to start dashboard server', error);
            reject(error);
        });
    });
}
