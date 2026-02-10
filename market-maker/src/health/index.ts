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
    failedCriticalChecks: string[];
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
    const failedCriticalChecks: string[] = [];

    logger.info('Running health checks...');

    for (const check of checks) {
        try {
            const result = await check.check();
            results.push(result);

            if (result.healthy) {
                logger.info(`✓ ${result.name}: ${result.message}`, result.details);
            } else if (result.critical) {
                logger.error(`✗ ${result.name}: ${result.message}`, undefined, result.details);
                failedChecks.push(result.name);
                failedCriticalChecks.push(result.name);

                // Notify on failed health check
                try {
                    getNotificationService().notifyHealthCheckFailed(result.name, result.message);
                } catch {
                    // Notification service might not be initialized yet
                }
            } else {
                logger.warn(`⚠ ${result.name}: ${result.message}`, result.details);
                failedChecks.push(result.name);
            }
        } catch (error) {
            const result: HealthCheckResult = {
                healthy: false,
                name: check.name,
                critical: check.critical,
                message: `Check threw error: ${error instanceof Error ? error.message : String(error)}`,
            };
            results.push(result);
            failedChecks.push(check.name);
            if (check.critical) {
                failedCriticalChecks.push(check.name);
            }
            logger.error(`✗ ${check.name}: Check threw error`, error instanceof Error ? error : new Error(String(error)));
        }
    }

    const allHealthy = failedChecks.length === 0;

    if (allHealthy) {
        logger.info('All health checks passed');
    } else if (failedCriticalChecks.length > 0) {
        logger.error(`${failedCriticalChecks.length} critical health check(s) failed`, undefined, { failedCriticalChecks });
    } else {
        logger.warn(`${failedChecks.length} non-critical health check(s) failed`, { failedChecks });
    }

    return {
        allHealthy,
        results,
        failedChecks,
        failedCriticalChecks,
    };
}

/**
 * Run health checks and fail fast only if critical checks fail
 * Non-critical failures (e.g. low wallet balance) log a warning but don't crash
 */
export async function requireHealthy(config: AppConfig): Promise<void> {
    const summary = await runHealthChecks(config);

    if (summary.failedCriticalChecks.length > 0) {
        throw new Error(`Critical health checks failed: ${summary.failedCriticalChecks.join(', ')}`);
    }
}

// Re-export types
export * from './checks';
