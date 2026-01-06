/**
 * Health check orchestrator
 */

import { AppConfig } from '../types';
import { createLogger } from '../utils/logger';
import { getNotificationService } from '../services/notifications';
import {
    HealthCheck,
    HealthCheckResult,
    createApiConnectivityCheck,
    createRpcConnectivityCheck,
    createWalletBalanceCheck,
    createWalletSigningCheck,
} from './checks';

const logger = createLogger('health');

export interface HealthCheckSummary {
    allHealthy: boolean;
    results: HealthCheckResult[];
    failedChecks: string[];
}

/**
 * Run all health checks
 */
export async function runHealthChecks(config: AppConfig): Promise<HealthCheckSummary> {
    const checks: HealthCheck[] = [
        createWalletSigningCheck(config),
        createRpcConnectivityCheck(config),
        createApiConnectivityCheck(config),
        createWalletBalanceCheck(config),
    ];

    const results: HealthCheckResult[] = [];
    const failedChecks: string[] = [];

    logger.info('Running health checks...');

    for (const check of checks) {
        try {
            const result = await check.check();
            results.push(result);

            if (result.healthy) {
                logger.info(`✓ ${result.name}: ${result.message}`, result.details);
            } else {
                logger.error(`✗ ${result.name}: ${result.message}`, undefined, result.details);
                failedChecks.push(result.name);

                // Notify on failed health check
                try {
                    getNotificationService().notifyHealthCheckFailed(result.name, result.message);
                } catch {
                    // Notification service might not be initialized yet
                }
            }
        } catch (error) {
            const result: HealthCheckResult = {
                healthy: false,
                name: check.name,
                message: `Check threw error: ${error instanceof Error ? error.message : String(error)}`,
            };
            results.push(result);
            failedChecks.push(check.name);
            logger.error(`✗ ${check.name}: Check threw error`, error instanceof Error ? error : new Error(String(error)));
        }
    }

    const allHealthy = failedChecks.length === 0;

    if (allHealthy) {
        logger.info('All health checks passed');
    } else {
        logger.error(`${failedChecks.length} health check(s) failed`, undefined, { failedChecks });
    }

    return {
        allHealthy,
        results,
        failedChecks,
    };
}

/**
 * Run health checks and fail fast if any critical checks fail
 */
export async function requireHealthy(config: AppConfig): Promise<void> {
    const summary = await runHealthChecks(config);

    if (!summary.allHealthy) {
        throw new Error(`Health checks failed: ${summary.failedChecks.join(', ')}`);
    }
}

// Re-export types
export * from './checks';
