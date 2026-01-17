/**
 * Configuration loading and validation
 * Supports both .env and Google Secret Manager for sensitive credentials
 */

import * as dotenv from 'dotenv';
import { AppConfig, RawEnvConfig } from '../types';
import { getSecrets, validateSecrets } from '../services/secrets';
import {
    ConfigValidationError,
    parseChains,
    parseTokens,
    parseBoolean,
    parseNumber,
    parseInt_,
    parseLogLevel,
    validateChains,
    validateSpread,
    validateAddress,
    validateUrl,
} from './validation';

// Load .env file
dotenv.config();

// Singleton config instance
let configInstance: AppConfig | null = null;

/**
 * Load non-secret configuration from environment
 */
function loadBaseConfig(): Omit<AppConfig, 'privateKey' | 'apiKey'> & { privateKey: string; apiKey: string } {
    const env = process.env as unknown as RawEnvConfig;
    const errors: string[] = [];

    // Parse values
    const supportedChains = parseChains(env.SUPPORTED_CHAINS || '98866');
    const priceSpread = parseNumber(env.PRICE_SPREAD, 0.98);
    const liquidationSpread = parseNumber(env.LIQUIDATION_SPREAD, 0.99);
    const useSecretManager = parseBoolean(env.USE_SECRET_MANAGER, false);
    const slackEnabled = parseBoolean(env.SLACK_ENABLED, false);
    const wsEnabled = parseBoolean(env.WS_ENABLED, false);
    const dashboardEnabled = parseBoolean(env.DASHBOARD_ENABLED, false);

    // Validate address (always required)
    const addressError = validateAddress(env.MARKET_MAKER_ADDRESS, 'MARKET_MAKER_ADDRESS');
    if (addressError) errors.push(addressError);

    // Validate chains
    const chainsError = validateChains(supportedChains);
    if (chainsError) errors.push(chainsError);

    // Validate spreads
    const priceSpreadError = validateSpread(priceSpread, 'PRICE_SPREAD');
    if (priceSpreadError) errors.push(priceSpreadError);

    const liquidationSpreadError = validateSpread(liquidationSpread, 'LIQUIDATION_SPREAD');
    if (liquidationSpreadError) errors.push(liquidationSpreadError);

    // Validate URLs
    const rpcUrlError = validateUrl(env.RPC_URL || 'https://rpc.plume.org', 'RPC_URL');
    if (rpcUrlError) errors.push(rpcUrlError);

    const apiUrlError = validateUrl(env.API_BASE_URL || 'https://api.mysticfinance.xyz', 'API_BASE_URL');
    if (apiUrlError) errors.push(apiUrlError);

    // Validate optional Slack URL if enabled
    if (slackEnabled) {
        const slackUrlError = validateUrl(env.SLACK_WEBHOOK_URL, 'SLACK_WEBHOOK_URL');
        if (slackUrlError) errors.push(slackUrlError);
    }

    // Validate optional WebSocket URL if enabled
    if (wsEnabled) {
        const wsUrlError = validateUrl(env.WS_URL, 'WS_URL');
        if (wsUrlError) errors.push(wsUrlError);
    }

    // Validate GCP project if Secret Manager is enabled
    if (useSecretManager && !env.GCP_PROJECT_ID) {
        errors.push('GCP_PROJECT_ID is required when USE_SECRET_MANAGER is enabled');
    }

    // Validate dashboard credentials if enabled
    if (dashboardEnabled) {
        if (!env.DASHBOARD_USERNAME) {
            errors.push('DASHBOARD_USERNAME is required when DASHBOARD_ENABLED is true');
        }
        if (!env.DASHBOARD_PASSWORD) {
            errors.push('DASHBOARD_PASSWORD is required when DASHBOARD_ENABLED is true');
        }
    }

    // Throw if there are validation errors
    if (errors.length > 0) {
        throw new ConfigValidationError(errors);
    }

    return {
        // API Configuration
        apiBaseUrl: env.API_BASE_URL || 'https://api.mysticfinance.xyz',
        apiKey: env.MARKET_MAKER_API_KEY || '',

        // Wallet Configuration
        privateKey: env.PRIVATE_KEY || '',
        marketMakerAddress: env.MARKET_MAKER_ADDRESS!,
        rpcUrl: env.RPC_URL || 'https://rpc.plume.org',

        // Secret Manager
        useSecretManager,
        gcpProjectId: env.GCP_PROJECT_ID || '',

        // Strategy Settings
        acceptedTokens: parseTokens(env.ACCEPTED_TOKENS),
        priceSpread,
        liquidationSpread,
        minBidAmountWei: env.MIN_BID_AMOUNT_WEI || '100',
        supportedChains,

        // Poll Intervals
        biddingPollIntervalMs: parseInt_(env.BIDDING_POLL_INTERVAL_MS, 5000),
        liquidationPollIntervalMs: parseInt_(env.LIQUIDATION_POLL_INTERVAL_MS, 10000),

        // Notifications
        slackWebhookUrl: env.SLACK_WEBHOOK_URL || '',
        slackEnabled,

        // Feature Flags
        enableBidding: parseBoolean(env.ENABLE_BIDDING, true),
        enableLiquidations: parseBoolean(env.ENABLE_LIQUIDATIONS, true),

        // Health Check
        minEthBalanceWei: env.MIN_ETH_BALANCE_WEI || '10000000000000000', // 0.01 ETH

        // Logging
        logLevel: parseLogLevel(env.LOG_LEVEL),

        // WebSocket
        wsEnabled,
        wsUrl: env.WS_URL || '',
        wsReconnectIntervalMs: parseInt_(env.WS_RECONNECT_INTERVAL_MS, 5000),

        // Dashboard
        dashboardEnabled,
        dashboardPort: parseInt_(env.DASHBOARD_PORT, 3000),
        dashboardUsername: env.DASHBOARD_USERNAME || 'admin',
        dashboardPassword: env.DASHBOARD_PASSWORD || '',
        databasePath: env.DATABASE_PATH || './data/market-maker.db',
    };
}

/**
 * Initialize configuration with secrets
 * Fetches secrets from Secret Manager if enabled, otherwise uses .env
 */
export async function initConfig(): Promise<AppConfig> {
    if (configInstance) {
        return configInstance;
    }

    const baseConfig = loadBaseConfig();

    // Fetch secrets from Secret Manager or use env vars
    const secrets = await getSecrets({
        useSecretManager: baseConfig.useSecretManager,
        gcpProjectId: baseConfig.gcpProjectId,
    });

    // Validate secrets
    const secretErrors = validateSecrets(secrets);
    if (secretErrors.length > 0) {
        throw new ConfigValidationError(secretErrors);
    }

    configInstance = {
        ...baseConfig,
        privateKey: secrets.privateKey,
        apiKey: secrets.apiKey || baseConfig.apiKey,
    };

    return configInstance;
}

/**
 * Get the initialized config
 * Throws if config has not been initialized
 */
export function getConfig(): AppConfig {
    if (!configInstance) {
        throw new Error('Config not initialized. Call initConfig() first.');
    }
    return configInstance;
}

/**
 * Legacy sync config export for backwards compatibility
 * Only use this if you're not using Secret Manager
 * @deprecated Use initConfig() and getConfig() instead
 */
export const config = loadBaseConfig() as AppConfig;

// Re-export validation utilities
export { ConfigValidationError } from './validation';
