/**
 * Liquidation Monitoring Loop
 * Monitors for underwater positions and triggers liquidations
 */

import { BigNumber } from '@0x/utils';
import { Liquidation, LiquidationAmounts, AppConfig } from '../types';
import { getConfig } from '../config';
import { createLogger } from '../utils/logger';
import { delay } from '../utils/delay';
import { signLimitOrder, calculateExpiry, generateSalt } from '../utils/signing';
import { getWalletManager } from '../services/wallet';
import { approveTokenToExchangeProxy } from '../services/wallet/approvals';
import { getOpenLiquidations, triggerLiquidation } from '../services/api/liquidation';
import { getNotificationService } from '../services/notifications';
import { getWebSocket, WebSocketEvent } from '../services/api/websocket';

const logger = createLogger('liquidation');

// Use Map with timestamps for proper cleanup
const processedLiquidations = new Map<string, number>();

// Constants
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PROCESSED_ENTRIES = 1000;
const MAX_LIQUIDATION_RATIO = 0.8;

/**
 * Calculate liquidation amounts
 */
function calculateLiquidationAmounts(liquidation: Liquidation): LiquidationAmounts {
    const debtAmount = new BigNumber(liquidation.borrowedAmount);
    const collateralAmount = new BigNumber(liquidation.collateralAmountThatCanBeSeized);

    if (!liquidation.collateralAmountThatCanBeSeized || collateralAmount.isZero()) {
        return {
            debtToRepay: '0',
            collateralToSeize: '0',
            profit: '0',
            collateralDecimals: 6,
            decimals: 6,
        };
    }

    const debtToRepay = debtAmount.multipliedBy(MAX_LIQUIDATION_RATIO);
    const collateralToSeize = collateralAmount.multipliedBy(MAX_LIQUIDATION_RATIO);

    const decimals = liquidation.borrowedPosition.asset.decimals ?? 6;
    const collateralDecimals = liquidation.collateralPosition.asset.decimals ?? 6;

    // Rough profit estimate
    const profit = collateralToSeize.minus(debtToRepay);

    return {
        debtToRepay: debtToRepay.multipliedBy(new BigNumber(10).pow(decimals)).integerValue().toString(),
        collateralToSeize: collateralToSeize.multipliedBy(new BigNumber(10).pow(collateralDecimals)).integerValue().toString(),
        profit: profit.toString(),
        collateralDecimals,
        decimals,
    };
}

/**
 * Calculate quote for liquidation
 */
function calculateLiquidationQuote(
    collateralToSeize: string,
    baseFeedPrice: number,
    cfg: AppConfig,
): string {
    const collateralAmount = new BigNumber(collateralToSeize);
    const debtValueWei = collateralAmount.multipliedBy(baseFeedPrice);

    // Apply spread for profit margin
    const quote = debtValueWei.multipliedBy(cfg.liquidationSpread).integerValue();

    return quote.toFixed(0);
}

/**
 * Check if we should liquidate this position
 */
function shouldLiquidate(liquidation: Liquidation, amounts: LiquidationAmounts, cfg: AppConfig): boolean {
    // Check health factor
    if (liquidation.healthFactor >= 1.0) {
        logger.debug('Skipping liquidation: position is healthy', {
            liquidationId: liquidation._id,
            healthFactor: liquidation.healthFactor,
        });
        return false;
    }

    // Check supported chains
    if (!cfg.supportedChains.includes(liquidation.chainId)) {
        logger.debug('Skipping liquidation: unsupported chain', {
            liquidationId: liquidation._id,
            chainId: liquidation.chainId,
        });
        return false;
    }

    // Check if there's anything to liquidate
    if (amounts.debtToRepay === '0' || amounts.collateralToSeize === '0') {
        logger.debug('Skipping liquidation: no debt or collateral', {
            liquidationId: liquidation._id,
        });
        return false;
    }

    return true;
}

/**
 * Process a single liquidation
 */
async function processSingleLiquidation(liquidation: Liquidation, cfg: AppConfig): Promise<void> {
    const liquidationId = liquidation._id;

    try {
        logger.info('Processing liquidation', {
            liquidationId,
            chainId: liquidation.chainId,
            healthFactor: liquidation.healthFactor,
        });

        const amounts = calculateLiquidationAmounts(liquidation);

        if (!shouldLiquidate(liquidation, amounts, cfg)) {
            return;
        }

        const walletManager = getWalletManager();
        const expiry = calculateExpiry(20); // 20 minutes

        const makerAmount = calculateLiquidationQuote(
            amounts.collateralToSeize,
            liquidation.baseFeedPrice,
            cfg,
        );

        // Add 1% buffer to amounts for slippage
        const makerAmountWithBuffer = new BigNumber(makerAmount).multipliedBy(1.01).integerValue().toString();
        const takerAmountWithBuffer = new BigNumber(amounts.collateralToSeize).multipliedBy(1.01).integerValue().toString();

        // Approve token
        await approveTokenToExchangeProxy(
            liquidation.exchangeProxy,
            makerAmountWithBuffer,
            liquidation.borrowedPosition.asset.id,
            walletManager,
        );

        // Sign order
        const { order, signature } = await signLimitOrder(
            {
                chainId: liquidation.chainId,
                verifyingContract: liquidation.exchangeProxy,
                maker: cfg.marketMakerAddress,
                taker: '0x0000000000000000000000000000000000000000',
                makerToken: liquidation.borrowedPosition.asset.id,
                takerToken: liquidation.collateralAsset,
                makerAmount: makerAmountWithBuffer,
                takerAmount: takerAmountWithBuffer,
                expiry,
                salt: generateSalt(),
            },
            walletManager.getWallet(),
        );

        // Trigger liquidation
        const result = await triggerLiquidation({
            liquidationId,
            marketMaker: cfg.marketMakerAddress,
            signature,
            debtAmountToLiquidate: parseFloat(amounts.debtToRepay) / Math.pow(10, amounts.decimals),
            orderInfo: order,
            expiry: 20,
        });

        logger.info('Liquidation triggered successfully', {
            liquidationId,
            txHash: result.txHash,
        });

        getNotificationService().notifyLiquidationTriggered(
            liquidationId,
            result.txHash,
            amounts.profit,
        );

    } catch (error) {
        logger.error('Failed to process liquidation', error instanceof Error ? error : new Error(String(error)), {
            liquidationId,
        });

        getNotificationService().notifyApiError('Liquidation trigger', error instanceof Error ? error : new Error(String(error)), {
            liquidationId,
        });
    }
}

/**
 * Clean up old processed entries
 */
function cleanupProcessedLiquidations(): void {
    const now = Date.now();
    const oneHourAgo = now - CLEANUP_INTERVAL_MS;
    let removed = 0;

    for (const [id, timestamp] of processedLiquidations) {
        if (timestamp < oneHourAgo) {
            processedLiquidations.delete(id);
            removed++;
        }
    }

    // If still too many, remove oldest entries
    if (processedLiquidations.size > MAX_PROCESSED_ENTRIES) {
        const entries = Array.from(processedLiquidations.entries())
            .sort((a, b) => a[1] - b[1]);

        const toRemove = entries.slice(0, entries.length - MAX_PROCESSED_ENTRIES);
        for (const [id] of toRemove) {
            processedLiquidations.delete(id);
            removed++;
        }
    }

    if (removed > 0) {
        logger.debug('Cleaned up processed liquidations', {
            removed,
            remaining: processedLiquidations.size,
        });
    }
}

/**
 * Handle WebSocket event for real-time liquidation opportunities
 */
function handleWebSocketEvent(event: WebSocketEvent, cfg: AppConfig): void {
    if (event.type === 'liquidation') {
        const liquidation = event.data;

        if (processedLiquidations.has(liquidation._id)) {
            return;
        }

        logger.debug('Received liquidation opportunity via WebSocket', {
            liquidationId: liquidation._id,
        });

        processSingleLiquidation(liquidation, cfg)
            .then(() => {
                processedLiquidations.set(liquidation._id, Date.now());
            })
            .catch(error => {
                logger.error('Failed to process WebSocket liquidation', error);
            });
    }
}

/**
 * Main liquidation monitoring loop
 */
export async function startLiquidationMonitor(): Promise<void> {
    const cfg = getConfig();

    logger.info('Starting liquidation monitor', {
        marketMaker: cfg.marketMakerAddress,
        chains: cfg.supportedChains,
        spread: `${(1 - cfg.liquidationSpread) * 100}%`,
    });

    // Setup WebSocket if enabled
    const ws = getWebSocket();
    if (ws) {
        ws.on('event', (event: WebSocketEvent) => handleWebSocketEvent(event, cfg));
        logger.info('WebSocket event handler registered for liquidations');
    }

    // Main polling loop
    while (true) {
        try {
            const liquidations = await getOpenLiquidations({
                supportedChains: cfg.supportedChains,
            });

            logger.debug('Found liquidation opportunities', { count: liquidations.length });

            for (const liquidation of liquidations) {
                if (processedLiquidations.has(liquidation._id)) {
                    continue;
                }

                await processSingleLiquidation(liquidation, cfg);
                processedLiquidations.set(liquidation._id, Date.now());
            }

            // Cleanup old entries
            cleanupProcessedLiquidations();

        } catch (error) {
            logger.error('Error in liquidation monitor', error instanceof Error ? error : new Error(String(error)));
        }

        await delay(cfg.liquidationPollIntervalMs);
    }
}
