/**
 * Health endpoint for dashboard
 */

import { Router } from 'express';
import { getDatabaseSize, getBotUptime } from '../../services/database';
import { getConfig } from '../../config';

const router = Router();

interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    database: {
        connected: boolean;
        size: number;
    };
    bot: {
        biddingEnabled: boolean;
        liquidationsEnabled: boolean;
        wsEnabled: boolean;
        supportedChains: number[];
    };
    timestamp: string;
}

router.get('/', (_req, res) => {
    try {
        const config = getConfig();
        const uptime = getBotUptime();
        const dbSize = getDatabaseSize();

        const response: HealthResponse = {
            status: 'healthy',
            uptime,
            database: {
                connected: true,
                size: dbSize,
            },
            bot: {
                biddingEnabled: config.enableBidding,
                liquidationsEnabled: config.enableLiquidations,
                wsEnabled: config.wsEnabled,
                supportedChains: config.supportedChains,
            },
            timestamp: new Date().toISOString(),
        };

        res.json(response);
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        });
    }
});

export { router as healthRoutes };
