/**
 * Failed transactions endpoint for dashboard
 */

import { Router } from 'express';
import {
    getFailedTransactions,
    getFailedTransactionById,
    updateFailedTransaction,
    getFailedTransactionCounts,
    GetFailedTransactionsOptions,
} from '../../services/database';
import { callTransform } from '../../services/api/rfq';
import { createLogger } from '../../utils/logger';

const logger = createLogger('dashboard-failed-tx');
const router = Router();

router.get('/', (req, res) => {
    try {
        const options: GetFailedTransactionsOptions = {
            period: (req.query.period as GetFailedTransactionsOptions['period']) || '7d',
            status: req.query.status as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        };

        const { data, total } = getFailedTransactions(options);

        const transformedData = data.map(row => ({
            id: row.id,
            operation: row.operation,
            errorType: row.error_type,
            errorMessage: row.error_message,
            requestId: row.request_id,
            liquidationId: row.liquidation_id,
            chainId: row.chain_id,
            txHash: row.tx_hash,
            context: row.context ? JSON.parse(row.context) : null,
            status: row.status,
            retryCount: row.retry_count,
            lastRetryAt: row.last_retry_at,
            createdAt: row.created_at,
        }));

        res.json({
            data: transformedData,
            counts: getFailedTransactionCounts(),
            pagination: {
                total,
                limit: options.limit,
                offset: options.offset,
                hasMore: (options.offset || 0) + (options.limit || 50) < total,
            },
        });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch failed transactions',
        });
    }
});

/**
 * Retry a failed transaction
 * For transform failures, re-calls the transform API
 * For other failures, marks as retrying so the bot picks them up
 */
router.post('/:id/retry', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const record = getFailedTransactionById(id);

        if (!record) {
            return res.status(404).json({ error: 'Failed transaction not found' });
        }

        if (record.status === 'resolved') {
            return res.status(400).json({ error: 'Transaction already resolved' });
        }

        // For transform failures with a request ID, retry the transform call
        if (record.request_id && record.operation.toLowerCase().includes('transform')) {
            try {
                const result = await callTransform(record.request_id);
                updateFailedTransaction(id, {
                    status: 'resolved',
                    retryCount: record.retry_count + 1,
                    lastRetryAt: new Date(),
                });
                return res.json({
                    success: true,
                    message: 'Transform retried successfully',
                    txHash: result.txHash,
                });
            } catch (retryError) {
                updateFailedTransaction(id, {
                    retryCount: record.retry_count + 1,
                    lastRetryAt: new Date(),
                });
                return res.status(500).json({
                    success: false,
                    message: `Retry failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
                });
            }
        }

        // For other failures, mark as retrying (bot will pick up on next cycle)
        updateFailedTransaction(id, {
            status: 'retrying',
            retryCount: record.retry_count + 1,
            lastRetryAt: new Date(),
        });

        logger.info('Marked failed transaction for retry', { id, operation: record.operation });

        res.json({
            success: true,
            message: 'Marked for retry. The bot will attempt this on the next cycle.',
        });
    } catch (error) {
        logger.error('Failed to retry transaction', error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to retry transaction',
        });
    }
});

/**
 * Dismiss a failed transaction (acknowledge it without retrying)
 */
router.post('/:id/dismiss', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const record = getFailedTransactionById(id);

        if (!record) {
            return res.status(404).json({ error: 'Failed transaction not found' });
        }

        updateFailedTransaction(id, { status: 'dismissed' });

        res.json({ success: true, message: 'Transaction dismissed' });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to dismiss transaction',
        });
    }
});

export { router as failedTransactionsRoutes };
