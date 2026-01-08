/**
 * Dashboard module entry point
 */

import { AppConfig } from '../types';
import { initDatabase } from '../services/database';
import { startDashboardServer } from './server';
import { createLogger } from '../utils/logger';

const logger = createLogger('dashboard');

/**
 * Initialize and start the dashboard
 */
export async function startDashboard(config: AppConfig): Promise<void> {
    if (!config.dashboardEnabled) {
        logger.info('Dashboard is disabled');
        return;
    }

    // Initialize database
    logger.info('Initializing dashboard database...');
    initDatabase({ databasePath: config.databasePath });

    // Start dashboard server
    logger.info('Starting dashboard server...');
    await startDashboardServer({
        port: config.dashboardPort,
        username: config.dashboardUsername,
        password: config.dashboardPassword,
    });

    logger.info('Dashboard initialized successfully');
}

export { startDashboardServer } from './server';
