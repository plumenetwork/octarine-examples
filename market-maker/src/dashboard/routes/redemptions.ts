/**
 * Redemptions endpoint for dashboard
 */

import { Router } from 'express';
import { getRedemptions, GetRedemptionsOptions } from '../../services/database';

const router = Router();

router.get('/', (req, res) => {
    try {
        const options: GetRedemptionsOptions = {
            period: (req.query.period as GetRedemptionsOptions['period']) || '7d',
            chainId: req.query.chainId ? parseInt(req.query.chainId as string, 10) : undefined,
            status: req.query.status as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        };

        const { data, total } = getRedemptions(options);

        // Transform snake_case to camelCase for frontend
        const transformedData = data.map(row => ({
            id: row.id,
            requestId: row.request_id,
            bidId: row.bid_id,
            maker: row.maker,
            makerAmount: row.maker_amount,
            redeemAsset: row.redeem_asset,
            redemptionAsset: row.redemption_asset,
            redeemAmount: row.redeem_amount,
            chainId: row.chain_id,
            userAddress: row.user_address,
            spread: row.spread,
            txHash: row.tx_hash,
            status: row.status,
            estimatedProfit: row.estimated_profit,
            createdAt: row.created_at,
            transformedAt: row.transformed_at,
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
            error: error instanceof Error ? error.message : 'Failed to fetch redemptions',
        });
    }
});

export { router as redemptionsRoutes };
