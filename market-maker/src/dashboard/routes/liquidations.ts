/**
 * Liquidations endpoint for dashboard
 */

import { Router } from 'express';
import { getLiquidations, GetLiquidationsOptions } from '../../services/database';

const router = Router();

router.get('/', (req, res) => {
    try {
        const options: GetLiquidationsOptions = {
            period: (req.query.period as GetLiquidationsOptions['period']) || '7d',
            chainId: req.query.chainId ? parseInt(req.query.chainId as string, 10) : undefined,
            status: req.query.status as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        };

        const { data, total } = getLiquidations(options);

        // Transform snake_case to camelCase for frontend
        const transformedData = data.map(row => ({
            id: row.id,
            liquidationId: row.liquidation_id,
            borrower: row.borrower,
            marketId: row.market_id,
            debtAsset: row.debt_asset,
            collateralAsset: row.collateral_asset,
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

export { router as liquidationsRoutes };
