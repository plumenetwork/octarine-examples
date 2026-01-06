/**
 * Octarine Market Maker Bot
 * Entry point with health checks and service initialization
 */

import { config } from './config';
import { setGlobalLogLevel, createLogger } from './utils/logger';
import { initWalletManager } from './services/wallet';
import { initApiClient } from './services/api/client';
import { initWebSocket } from './services/api/websocket';
import { initNotificationService, getNotificationService } from './services/notifications';
import { requireHealthy } from './health';
import { startBiddingLoop } from './loops/bidding';
import { startLiquidationMonitor } from './loops/liquidation';

const logger = createLogger('main');

async function main(): Promise<void> {
    // Set log level from config
    setGlobalLogLevel(config.logLevel);

    logger.info('Starting Octarine Market Maker Bot', {
        version: '2.0.0',
        marketMaker: config.marketMakerAddress,
        chains: config.supportedChains,
        biddingEnabled: config.enableBidding,
        liquidationsEnabled: config.enableLiquidations,
        wsEnabled: config.wsEnabled,
        slackEnabled: config.slackEnabled,
    });

    // Initialize services
    logger.info('Initializing services...');

    // Wallet manager (singleton with mutex for nonce management)
    initWalletManager(config.privateKey, config.rpcUrl);

    // API client with retry logic
    initApiClient(config);

    // Notification service (Slack)
    initNotificationService(config);

    // Run health checks before starting loops
    logger.info('Running health checks...');
    await requireHealthy(config);

    // Initialize WebSocket if enabled
    if (config.wsEnabled && config.wsUrl) {
        logger.info('Connecting to WebSocket...');
        const ws = initWebSocket({
            url: config.wsUrl,
            reconnectIntervalMs: config.wsReconnectIntervalMs,
            supportedChains: config.supportedChains,
            marketMakerAddress: config.marketMakerAddress,
        });

        try {
            await ws.connect();
            logger.info('WebSocket connected');
        } catch (error) {
            logger.warn('WebSocket connection failed, falling back to polling only', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // Notify bot started
    getNotificationService().notifyBotStarted();

    // Start loops based on configuration
    const loops: Promise<void>[] = [];

    if (config.enableBidding) {
        logger.info('Starting bidding loop...');
        loops.push(startBiddingLoop());
    } else {
        logger.info('Bidding loop disabled');
    }

    if (config.enableLiquidations) {
        logger.info('Starting liquidation monitor...');
        loops.push(startLiquidationMonitor());
    } else {
        logger.info('Liquidation monitor disabled');
    }

    if (loops.length === 0) {
        logger.warn('No loops enabled! Check ENABLE_BIDDING and ENABLE_LIQUIDATIONS settings.');
        return;
    }

    // Run loops concurrently
    await Promise.all(loops);
}

// Handle graceful shutdown
function setupGracefulShutdown(): void {
    const shutdown = (signal: string) => {
        logger.info(`Received ${signal}, shutting down...`);

        try {
            getNotificationService().notifyBotStopped(`Received ${signal}`);
        } catch {
            // Notification service might fail during shutdown
        }

        // Give some time for notifications to send
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', error);
        try {
            getNotificationService().notifyApiError('Uncaught exception', error);
        } catch {
            // Best effort
        }
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
    });
}

// Entry point
if (require.main === module) {
    setupGracefulShutdown();

    main().catch((error) => {
        logger.error('Bot crashed', error);
        process.exit(1);
    });
}

export { main };
