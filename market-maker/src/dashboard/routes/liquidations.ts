/**
 * Liquidations endpoint for dashboard
 */

import { Router } from 'express';
import { getLiquidations, GetLiquidationsOptions, getPendingLiquidations, updateLiquidation } from '../../services/database';
import { getBidStatus, fetchAllOpportunities } from '../../services/api/liquidation';
import { processSingleLiquidation } from '../../loops/liquidation';
import { getConfig } from '../../config';
import { createLogger } from '../../utils/logger';

const logger = createLogger('dashboard-liquidations');

const router = Router();

router.get('/', (req, res) => {
    try {
        const options: GetLiquidationsOptions = {
            period: (req.query.period as GetLiquidationsOptions['period']) || '7d',
            chainId: req.query.chainId ? parseInt(req.query.chainId as string, 10) : undefined,
            status: req.query.status as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 2000,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        };

        const { data, total } = getLiquidations(options);

        // Transform snake_case to camelCase for frontend
        const transformedData = data.map(row => ({
            id: row.id,
            liquidationId: row.liquidation_id,
            bidId: row.bid_id,
            borrower: row.borrower,
            marketId: row.market_id,
            debtAsset: row.debt_asset,
            collateralAsset: row.collateral_asset,
            debtAssetSymbol: row.debt_asset_symbol,
            collateralAssetSymbol: row.collateral_asset_symbol,
            borrowedAmount: row.borrowed_amount,
            collateralAmount: row.collateral_amount,
            debtToRepay: row.debt_to_repay,
            collateralToSeize: row.collateral_to_seize,
            makerAmount: row.maker_amount,
            healthFactor: row.health_factor,
            chainId: row.chain_id,
            txHash: row.tx_hash,
            status: row.status,
            estimatedProfit: row.estimated_profit,
            createdAt: row.created_at,
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
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch liquidations',
        });
    }
});

/**
 * Check pending liquidations for status updates
 */
router.post('/check-pending', async (_req, res) => {
    try {
        const pending = getPendingLiquidations(100);
        const updated: { liquidationId: string; newStatus: string; txHash?: string }[] = [];

        for (const row of pending) {
            try {
                if (!row.bid_id) continue;

                const bidStatus = await getBidStatus(row.bid_id);
                if (!bidStatus) continue;

                const updates: { status?: string; txHash?: string } = {};

                if ((bidStatus.status === 'accepted' && bidStatus.txHash) || bidStatus.txHash) {
                    updates.txHash = bidStatus.txHash;
                    updates.status = 'executed';
                } else if (bidStatus.status === 'failed' || bidStatus.status === 'expired' || bidStatus.status === 'rejected') {
                    updates.status = bidStatus.status;
                }

                if (Object.keys(updates).length > 0) {
                    updateLiquidation(row.liquidation_id, updates);
                    updated.push({
                        liquidationId: row.liquidation_id,
                        newStatus: updates.status || row.status,
                        txHash: updates.txHash,
                    });
                }
            } catch {
                // Skip individual failures
            }
        }

        res.json({ checked: pending.length, updated });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to check pending liquidations',
        });
    }
});

/**
 * Manually trigger a liquidation by ID
 */
router.post('/trigger', async (req, res) => {
    try {
        const { liquidationId } = req.body;
        if (!liquidationId) {
            return res.status(400).json({ error: 'liquidationId is required' });
        }

        const cfg = getConfig();

        // Fetch all opportunities from the API to get full Liquidation objects
        const { liquidations } = await fetchAllOpportunities();
        const liquidation = liquidations.find(l => l._id === liquidationId);

        if (!liquidation) {
            return res.status(404).json({ error: `Liquidation ${liquidationId} not found in current opportunities` });
        }

        logger.info('Manual liquidation trigger from dashboard', { liquidationId });

        const result = await processSingleLiquidation(liquidation, cfg);

        if (!result) {
            return res.json({ success: false, message: 'Liquidation skipped (shouldLiquidate=false or insufficient data)' });
        }

        res.json({ success: true, bidId: result.bidId, status: result.status });
    } catch (error) {
        logger.error('Manual liquidation trigger failed', error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to trigger liquidation',
        });
    }
});

export { router as liquidationsRoutes };
