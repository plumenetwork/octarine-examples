/**
 * Opportunities sync endpoint for dashboard
 */

import { Router } from 'express';
import { getOpportunityCount, upsertOpportunities, getOpportunities, getOpportunityMarketBreakdown, GetOpportunitiesOptions } from '../../services/database/opportunities';
import { fetchAllOpportunities } from '../../services/api/liquidation';
import { createLogger } from '../../utils/logger';
import { ethers } from 'ethers';

const logger = createLogger('opportunities-route');

const router = Router();

let syncInProgress = false;
let lastSyncResult: { syncedAt: string; inserted: number; updated: number; totalApi: number } | null = null;

/**
 * GET /api/opportunities/status
 * Returns sync status: DB count, whether sync is in progress, last sync result
 */
router.get('/status', async (_req, res) => {
    try {
        const dbCount = getOpportunityCount();

        // Quick check: fetch page 1 with limit=1 to get totalItems without downloading everything
        let apiTotal: number | null = null;
        try {
            const { getApiClient } = await import('../../services/api/client');
            const client = getApiClient();
            const response = await client.getOnce<{ totalItems: number }>(
                '/octarine/liquidations/opportunities',
                { params: { limit: 1, page: 1 }, timeout: 10000 },
            );
            apiTotal = response.totalItems || null;
        } catch {
            // Can't reach API — that's fine, just report DB count
        }

        res.json({
            dbCount,
            apiTotal,
            syncRequired: apiTotal !== null && apiTotal > dbCount,
            syncInProgress,
            lastSync: lastSyncResult,
        });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get sync status' });
    }
});

/**
 * POST /api/opportunities/sync
 * Trigger a full sync of all opportunities from the API
 */
router.post('/sync', async (_req, res) => {
    if (syncInProgress) {
        res.status(409).json({ error: 'Sync already in progress' });
        return;
    }

    syncInProgress = true;
    res.json({ message: 'Sync started', syncInProgress: true });

    // Run sync in background so the response returns immediately
    try {
        logger.info('Starting opportunity sync');

        const { liquidations, totalItems } = await fetchAllOpportunities(1000);

        logger.info('Fetched all opportunities from API', {
            count: liquidations.length,
            totalItems,
        });

        const result = upsertOpportunities(liquidations);

        lastSyncResult = {
            syncedAt: new Date().toISOString(),
            inserted: result.inserted,
            updated: result.updated,
            totalApi: totalItems,
        };

        logger.info('Opportunity sync complete', {
            inserted: result.inserted,
            updated: result.updated,
            totalApi: totalItems,
        });
    } catch (error) {
        logger.error('Opportunity sync failed', error instanceof Error ? error : new Error(String(error)));
    } finally {
        syncInProgress = false;
    }
});

/**
 * GET /api/opportunities/markets
 * Returns opportunity breakdown by market with wallet balance info
 */
const balanceCache = new Map<string, { balance: string; fetchedAt: number }>();
const BALANCE_CACHE_TTL = 60_000; // 60 seconds

router.get('/markets', async (_req, res) => {
    try {
        const markets = getOpportunityMarketBreakdown();

        // Try to get wallet balances for each unique debt token
        let walletAvailable = true;
        let getBalance: ((addr: string) => Promise<ethers.BigNumber>) | null = null;

        try {
            const { getWalletManager } = await import('../../services/wallet');
            const wm = getWalletManager();
            getBalance = (addr: string) => wm.getTokenBalance(addr);
        } catch {
            walletAvailable = false;
        }

        const result = await Promise.all(
            markets.map(async (market) => {
                let walletBalance: string | null = null;
                let sufficientBalance = false;

                if (walletAvailable && getBalance && market.debtAsset) {
                    try {
                        const cached = balanceCache.get(market.debtAsset);
                        const now = Date.now();

                        if (cached && now - cached.fetchedAt < BALANCE_CACHE_TTL) {
                            walletBalance = cached.balance;
                        } else {
                            const bal = await getBalance(market.debtAsset);
                            walletBalance = bal.toString();
                            balanceCache.set(market.debtAsset, { balance: walletBalance, fetchedAt: now });
                        }

                        // Compare wallet balance against min borrowed amount in this market
                        const minBorrowed = ethers.BigNumber.from(
                            market.minBorrowedAmount.includes('.')
                                ? market.minBorrowedAmount.split('.')[0]
                                : market.minBorrowedAmount || '0'
                        );
                        const bal = ethers.BigNumber.from(walletBalance);
                        sufficientBalance = bal.gte(minBorrowed) && !minBorrowed.isZero();
                    } catch {
                        // Balance fetch failed for this token — leave as null
                    }
                }

                return {
                    ...market,
                    walletBalance,
                    sufficientBalance,
                };
            }),
        );

        // Sort: sufficient balance first, then by count desc
        result.sort((a, b) => {
            if (a.sufficientBalance !== b.sufficientBalance) {
                return a.sufficientBalance ? -1 : 1;
            }
            return b.count - a.count;
        });

        res.json({ markets: result });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get market breakdown' });
    }
});

/**
 * GET /api/opportunities
 * List synced opportunities with pagination
 */
router.get('/', (req, res) => {
    try {
        const options: GetOpportunitiesOptions = {
            chainId: req.query.chainId ? parseInt(req.query.chainId as string, 10) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        };

        const { data, total } = getOpportunities(options);

        const transformedData = data.map(row => ({
            id: row.id,
            liquidationId: row.liquidation_id,
            marketId: row.market_id,
            borrower: row.borrower,
            collateralAsset: row.collateral_asset,
            debtAsset: row.debt_asset,
            collateralAssetSymbol: row.collateral_asset_symbol,
            debtAssetSymbol: row.debt_asset_symbol,
            collateralAmount: row.collateral_amount,
            borrowedAmount: row.borrowed_amount,
            collateralAmountSeizeable: row.collateral_amount_seizeable,
            healthFactor: row.health_factor,
            chainId: row.chain_id,
            baseFeedPrice: row.base_feed_price,
            status: row.status,
            syncedAt: row.synced_at,
        }));

        res.json({
            data: transformedData,
            pagination: {
                total,
                limit: options.limit,
                offset: options.offset,
                hasMore: (options.offset || 0) + (options.limit || 50) < total,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch opportunities' });
    }
});

export { router as opportunitiesRoutes };
