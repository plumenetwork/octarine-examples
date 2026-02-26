/**
 * Liquidation Monitoring Loop
 * Monitors for underwater positions and triggers liquidations
 */

import { BigNumber } from '@0x/utils';
import { ethers } from 'ethers';
import { Liquidation, LiquidationAmounts, AppConfig } from '../types';
import { getConfig } from '../config';
import { createLogger } from '../utils/logger';
import { delay } from '../utils/delay';
import { signLimitOrder, calculateExpiry, generateSalt } from '../utils/signing';
import { getWalletManager } from '../services/wallet';
import { approveTokenToExchangeProxy } from '../services/wallet/approvals';
import { getOpenLiquidations, triggerLiquidation, getBidStatus } from '../services/api/liquidation';
import { getPendingLiquidations, updateLiquidation } from '../services/database/liquidations';
import { throttleManager, isThrottleError } from '../services/api/throttle';
import { getNotificationService } from '../services/notifications';
import { getWebSocket, WebSocketEvent } from '../services/api/websocket';

const logger = createLogger('liquidation');

// Use Map with timestamps for proper cleanup
const processedLiquidations = new Map<string, number>();

// Constants
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PROCESSED_ENTRIES = 1000;
const MAX_LIQUIDATION_RATIO = 0.8;
const DELAY_BETWEEN_TRIGGERS_MS = 2000; // 2s between API calls to avoid rate limiting

/**
 * Tracks available token balances during a liquidation batch.
 * Fetches once from chain, then decrements as we commit to liquidations.
 */
class BalanceTracker {
    private balances = new Map<string, ethers.BigNumber>();

    async loadBalance(tokenAddress: string): Promise<void> {
        if (this.balances.has(tokenAddress.toLowerCase())) return;
        const walletManager = getWalletManager();
        try {
            const balance = await walletManager.getTokenBalance(tokenAddress);
            this.balances.set(tokenAddress.toLowerCase(), balance);
            logger.info('Loaded token balance', {
                token: tokenAddress.slice(0, 10),
                balance: balance.toString(),
            });
        } catch (error) {
            logger.warn('Failed to load token balance, allowing liquidation', {
                token: tokenAddress,
                error: error instanceof Error ? error.message : String(error),
            });
            // If we can't check, set a very high balance so we don't block
            this.balances.set(tokenAddress.toLowerCase(), ethers.constants.MaxUint256);
        }
    }

    hasEnough(tokenAddress: string, amount: string): boolean {
        const balance = this.balances.get(tokenAddress.toLowerCase());
        if (!balance) return true; // If not tracked, allow
        return balance.gte(ethers.BigNumber.from(amount));
    }

    deduct(tokenAddress: string, amount: string): void {
        const key = tokenAddress.toLowerCase();
        const balance = this.balances.get(key);
        if (balance) {
            this.balances.set(key, balance.sub(ethers.BigNumber.from(amount)));
        }
    }

    getBalance(tokenAddress: string): string {
        return this.balances.get(tokenAddress.toLowerCase())?.toString() || '0';
    }
}

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
    if (!cfg.supportedChains.includes(Number(liquidation.chainId))) {
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
 * Returns { bidId, status } on success, null if skipped, throws on error.
 */
export async function processSingleLiquidation(
    liquidation: Liquidation,
    cfg: AppConfig,
    balanceTracker?: BalanceTracker,
): Promise<{ bidId: string; status: string } | null> {
    const liquidationId = liquidation._id;

    try {
        logger.info('Processing liquidation', {
            liquidationId,
            chainId: liquidation.chainId,
            healthFactor: liquidation.healthFactor,
        });

        const amounts = calculateLiquidationAmounts(liquidation);

        if (!shouldLiquidate(liquidation, amounts, cfg)) {
            return null;
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

        // Check balance before proceeding
        const debtToken = liquidation.borrowedPosition.asset.id;
        if (balanceTracker) {
            await balanceTracker.loadBalance(debtToken);

            if (!balanceTracker.hasEnough(debtToken, makerAmountWithBuffer)) {
                const debtSymbol = liquidation.borrowedPosition?.asset?.symbol || 'token';
                logger.warn('Skipping liquidation: insufficient balance', {
                    liquidationId,
                    debtToken: debtSymbol,
                    required: makerAmountWithBuffer,
                    available: balanceTracker.getBalance(debtToken),
                });
                return null;
            }
        }

        // Approve token
        await approveTokenToExchangeProxy(
            liquidation.exchangeProxy,
            makerAmountWithBuffer,
            debtToken,
            walletManager,
        );

        // Sign order
        const { order, signature } = await signLimitOrder(
            {
                chainId: liquidation.chainId,
                verifyingContract: liquidation.exchangeProxy,
                maker: cfg.marketMakerAddress,
                taker: '0x0000000000000000000000000000000000000000',
                makerToken: debtToken,
                takerToken: liquidation.collateralAsset,
                makerAmount: makerAmountWithBuffer,
                takerAmount: takerAmountWithBuffer,
                expiry,
                salt: generateSalt(),
            },
            walletManager.getWallet(),
        );

        // Extract liquidation bonus from market data
        const liquidationPenalty = parseFloat(
            liquidation.borrowedPosition?.market?.liquidationPenalty || '0',
        );

        // Submit liquidation bid
        const result = await triggerLiquidation({
            liquidationId,
            marketMaker: cfg.marketMakerAddress,
            signature,
            debtAmountToLiquidate: parseFloat(amounts.debtToRepay) / Math.pow(10, amounts.decimals),
            orderInfo: order,
            expiry: 20,
            liquidationBonusPercentage: liquidationPenalty,
        });

        // Deduct from tracked balance after successful trigger
        if (balanceTracker) {
            balanceTracker.deduct(debtToken, makerAmountWithBuffer);
        }

        logger.info('Liquidation bid submitted successfully', {
            liquidationId,
            bidId: result.bidId,
            status: result.status,
        });

        const borrowerAddress = liquidation.borrowedPosition?.account?.id || liquidation.borrower || '';

        getNotificationService().notifyLiquidationTriggered(
            liquidationId,
            result.bidId,
            {
                profit: amounts.profit,
                borrower: borrowerAddress,
                marketId: liquidation.marketId,
                debtAsset: debtToken,
                collateralAsset: liquidation.collateralAsset,
                debtAssetSymbol: liquidation.borrowedPosition?.asset?.symbol,
                collateralAssetSymbol: liquidation.collateralPosition?.asset?.symbol,
                borrowedAmount: liquidation.borrowedAmount,
                collateralAmount: liquidation.collateralAmount,
                debtToRepay: amounts.debtToRepay,
                collateralToSeize: amounts.collateralToSeize,
                makerAmount: makerAmount,
                healthFactor: liquidation.healthFactor,
                chainId: Number(liquidation.chainId),
            },
        );

        return { bidId: result.bidId, status: result.status };

    } catch (error) {
        logger.error('Failed to process liquidation', error instanceof Error ? error : new Error(String(error)), {
            liquidationId,
        });

        getNotificationService().notifyApiError('Liquidation trigger', error instanceof Error ? error : new Error(String(error)), {
            liquidationId,
            chainId: Number(liquidation.chainId),
            borrower: liquidation.borrowedPosition?.account?.id || liquidation.borrower,
            marketId: liquidation.marketId,
            debtAsset: liquidation.borrowedPosition?.asset?.id,
            collateralAsset: liquidation.collateralAsset,
            healthFactor: liquidation.healthFactor,
        });

        throw error;
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
 * Poll pending liquidations for txHash updates
 * Uses GET /octarine/bid/{bidId} to check if bids have been accepted/executed.
 * A bid with status "accepted" + transactionHash means it was fulfilled on-chain.
 */
async function pollPendingLiquidations(): Promise<void> {
    try {
        const pending = getPendingLiquidations(20);
        if (pending.length === 0) return;

        logger.debug('Polling pending liquidation statuses', { count: pending.length });

        for (const row of pending) {
            try {
                // Need bid_id to check bid status
                if (!row.bid_id) {
                    logger.debug('Skipping pending liquidation without bid_id', {
                        liquidationId: row.liquidation_id,
                    });
                    continue;
                }

                const bidStatus = await getBidStatus(row.bid_id);
                if (!bidStatus) continue;

                const updates: { status?: string; txHash?: string } = {};

                // "accepted" with a txHash means the bid was fulfilled on-chain
                if (bidStatus.status === 'accepted' && bidStatus.txHash) {
                    updates.txHash = bidStatus.txHash;
                    updates.status = 'executed';
                    logger.info('Liquidation bid accepted and executed on-chain', {
                        liquidationId: row.liquidation_id,
                        bidId: row.bid_id,
                        txHash: bidStatus.txHash,
                    });
                } else if (bidStatus.txHash) {
                    // txHash present with any status = executed
                    updates.txHash = bidStatus.txHash;
                    updates.status = 'executed';
                    logger.info('Liquidation executed on-chain', {
                        liquidationId: row.liquidation_id,
                        bidId: row.bid_id,
                        txHash: bidStatus.txHash,
                        bidStatus: bidStatus.status,
                    });
                } else if (bidStatus.status === 'failed' || bidStatus.status === 'expired' || bidStatus.status === 'rejected') {
                    updates.status = bidStatus.status;
                    logger.warn('Liquidation bid did not execute', {
                        liquidationId: row.liquidation_id,
                        bidId: row.bid_id,
                        bidStatus: bidStatus.status,
                    });
                }

                if (Object.keys(updates).length > 0) {
                    updateLiquidation(row.liquidation_id, updates);
                }
            } catch {
                // Skip individual failures
            }
        }
    } catch (error) {
        logger.error('Error polling pending liquidations', error instanceof Error ? error : new Error(String(error)));
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
        // Check if throttled — back off or wait for manual resume
        if (throttleManager.shouldWait()) {
            if (throttleManager.isPaused()) {
                logger.debug('Liquidation loop paused (throttled). Waiting for manual resume from dashboard.');
                await delay(30_000);
            } else {
                const remaining = throttleManager.getWaitRemaining();
                logger.debug(`Liquidation loop backing off for ${Math.round(remaining / 1000)}s due to API throttle`);
                await delay(Math.min(remaining, 30_000));
            }
            continue;
        }

        try {
            const liquidations = await getOpenLiquidations({
                supportedChains: cfg.supportedChains,
            });

            logger.debug('Found liquidation opportunities', { count: liquidations.length });

            // Fresh balance tracker for each poll cycle
            const balanceTracker = new BalanceTracker();

            // Pre-load balances for all unique debt tokens in this batch
            const debtTokens = new Set(
                liquidations
                    .filter(l => !processedLiquidations.has(l._id))
                    .map(l => l.borrowedPosition?.asset?.id)
                    .filter(Boolean),
            );
            for (const token of debtTokens) {
                await balanceTracker.loadBalance(token);
            }

            for (const liquidation of liquidations) {
                if (processedLiquidations.has(liquidation._id)) {
                    continue;
                }

                // Check throttle between triggers too
                if (throttleManager.shouldWait()) break;

                await processSingleLiquidation(liquidation, cfg, balanceTracker);
                processedLiquidations.set(liquidation._id, Date.now());

                // Delay between triggers to avoid API rate limiting (429)
                await delay(DELAY_BETWEEN_TRIGGERS_MS);
            }

            // Cleanup old entries
            cleanupProcessedLiquidations();

            // Poll pending liquidations for txHash updates
            await pollPendingLiquidations();

        } catch (error) {
            // 429 is already handled by the API client interceptor (throttleManager.onThrottled)
            // so we just need to handle non-throttle errors here
            if (!isThrottleError(error)) {
                logger.error('Error in liquidation monitor', error instanceof Error ? error : new Error(String(error)));
            }
        }

        await delay(cfg.liquidationPollIntervalMs);
    }
}
