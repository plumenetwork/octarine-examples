/**
 * Database recorder notifier
 * Records notification events to SQLite database for dashboard analytics
 */

import { Notifier, NotificationPayload, NotificationType } from './types';
import {
    insertRedemption,
    updateRedemption,
    getRedemptionByRequestId,
    insertLiquidation,
    recordBotStatus,
} from '../database';
import { createLogger } from '../../utils/logger';

const logger = createLogger('db-recorder');

export class DatabaseRecorder implements Notifier {
    async send(payload: NotificationPayload): Promise<void> {
        try {
            switch (payload.type) {
                case NotificationType.BID_WON:
                    await this.recordBidWon(payload);
                    break;

                case NotificationType.TRANSFORM_EXECUTED:
                    await this.recordTransformExecuted(payload);
                    break;

                case NotificationType.LIQUIDATION_TRIGGERED:
                    await this.recordLiquidation(payload);
                    break;

                case NotificationType.BOT_STARTED:
                    recordBotStatus('started', payload.message);
                    break;

                case NotificationType.BOT_STOPPED:
                    recordBotStatus('stopped', payload.message);
                    break;

                default:
                    // Other notification types are not recorded to DB
                    break;
            }
        } catch (error) {
            logger.error('Failed to record event to database', error instanceof Error ? error : new Error(String(error)));
        }
    }

    private async recordBidWon(payload: NotificationPayload): Promise<void> {
        const meta = payload.metadata || {};

        const requestId = String(meta.requestId || '');
        const makerAmount = String(meta.makerAmount || '');

        // Only insert if we have the required data
        if (!requestId || !makerAmount) {
            logger.warn('BID_WON missing required metadata', { metadata: meta });
            return;
        }

        // Check if already exists (avoid duplicates)
        const existing = getRedemptionByRequestId(requestId);
        if (existing) {
            logger.debug('Redemption already exists, skipping insert', { requestId });
            return;
        }

        insertRedemption({
            requestId,
            bidId: meta.bidId ? String(meta.bidId) : undefined,
            maker: String(meta.maker || ''),
            makerAmount,
            redeemAsset: String(meta.redeemAsset || ''),
            redemptionAsset: String(meta.redemptionAsset || ''),
            redeemAmount: String(meta.redeemAmount || '0'),
            chainId: Number(meta.chainId) || 0,
            userAddress: meta.userAddress ? String(meta.userAddress) : undefined,
            spread: meta.spread ? Number(meta.spread) : undefined,
            estimatedProfit: meta.estimatedProfit ? String(meta.estimatedProfit) : undefined,
        });

        logger.debug('Recorded bid won to database', { requestId });
    }

    private async recordTransformExecuted(payload: NotificationPayload): Promise<void> {
        const meta = payload.metadata || {};
        const requestId = String(meta.requestId || '');

        if (!requestId) {
            logger.warn('TRANSFORM_EXECUTED missing requestId');
            return;
        }

        const updated = updateRedemption(requestId, {
            status: 'transformed',
            txHash: meta.txHash ? String(meta.txHash) : undefined,
            transformedAt: payload.timestamp,
        });

        if (!updated) {
            logger.warn('Could not update redemption for transform', { requestId });
        } else {
            logger.debug('Recorded transform to database', { requestId });
        }
    }

    private async recordLiquidation(payload: NotificationPayload): Promise<void> {
        const meta = payload.metadata || {};
        const liquidationId = String(meta.liquidationId || '');

        if (!liquidationId) {
            logger.warn('LIQUIDATION_TRIGGERED missing liquidationId');
            return;
        }

        insertLiquidation({
            liquidationId,
            borrower: String(meta.borrower || ''),
            marketId: meta.marketId ? String(meta.marketId) : undefined,
            debtAsset: String(meta.debtAsset || ''),
            collateralAsset: String(meta.collateralAsset || ''),
            debtToRepay: String(meta.debtToRepay || '0'),
            collateralToSeize: String(meta.collateralToSeize || '0'),
            makerAmount: String(meta.makerAmount || '0'),
            healthFactor: meta.healthFactor ? Number(meta.healthFactor) : undefined,
            chainId: Number(meta.chainId) || 0,
            txHash: meta.txHash ? String(meta.txHash) : undefined,
            estimatedProfit: meta.estimatedProfit ? String(meta.estimatedProfit) : undefined,
        });

        logger.debug('Recorded liquidation to database', { liquidationId });
    }
}
