/**
 * Failed transaction database operations
 */

import { getDatabase } from './index';
import { FailedTransactionRow } from './schema';

export interface InsertFailedTransaction {
    operation: string;
    errorType: string;
    errorMessage: string;
    requestId?: string;
    liquidationId?: string;
    chainId?: number;
    txHash?: string;
    context?: Record<string, unknown>;
}

export interface GetFailedTransactionsOptions {
    period?: '7d' | '30d' | 'all';
    status?: string;
    limit?: number;
    offset?: number;
}

/**
 * Insert or update a failed transaction record.
 * If a non-resolved record already exists for the same liquidation_id or request_id,
 * update it (increment retry_count, refresh error message) instead of creating a duplicate.
 */
export function insertFailedTransaction(data: InsertFailedTransaction): void {
    const db = getDatabase();

    // Check for existing active record by liquidation_id
    if (data.liquidationId) {
        const existing = db
            .prepare(
                `SELECT id, retry_count FROM failed_transactions
                 WHERE liquidation_id = ? AND status IN ('failed', 'retrying')
                 LIMIT 1`,
            )
            .get(data.liquidationId) as { id: number; retry_count: number } | undefined;

        if (existing) {
            db.prepare(
                `UPDATE failed_transactions
                 SET error_message = ?, retry_count = retry_count + 1, last_retry_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
            ).run(data.errorMessage, existing.id);
            return;
        }
    }

    // Check for existing active record by request_id
    if (data.requestId) {
        const existing = db
            .prepare(
                `SELECT id, retry_count FROM failed_transactions
                 WHERE request_id = ? AND status IN ('failed', 'retrying')
                 LIMIT 1`,
            )
            .get(data.requestId) as { id: number; retry_count: number } | undefined;

        if (existing) {
            db.prepare(
                `UPDATE failed_transactions
                 SET error_message = ?, retry_count = retry_count + 1, last_retry_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
            ).run(data.errorMessage, existing.id);
            return;
        }
    }

    // No existing record — insert new
    db.prepare(`
        INSERT INTO failed_transactions (operation, error_type, error_message, request_id, liquidation_id, chain_id, tx_hash, context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.operation,
        data.errorType,
        data.errorMessage,
        data.requestId || null,
        data.liquidationId || null,
        data.chainId || null,
        data.txHash || null,
        data.context ? JSON.stringify(data.context) : null,
    );
}

/**
 * Get failed transactions with filtering and pagination
 */
export function getFailedTransactions(
    options: GetFailedTransactionsOptions = {},
): { data: FailedTransactionRow[]; total: number } {
    const db = getDatabase();
    const { period = '7d', status, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Period filter
    if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        conditions.push('created_at >= ?');
        params.push(cutoff.toISOString().replace('T', ' ').split('.')[0]);
    }

    // Status filter
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRow = db
        .prepare(`SELECT COUNT(*) as count FROM failed_transactions ${where}`)
        .get(...params) as { count: number };

    // Get paginated data
    const data = db
        .prepare(
            `SELECT * FROM failed_transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as FailedTransactionRow[];

    return { data, total: countRow.count };
}

/**
 * Get a single failed transaction by ID
 */
export function getFailedTransactionById(id: number): FailedTransactionRow | undefined {
    const db = getDatabase();
    return db
        .prepare('SELECT * FROM failed_transactions WHERE id = ?')
        .get(id) as FailedTransactionRow | undefined;
}

/**
 * Update a failed transaction's status
 */
export function updateFailedTransaction(
    id: number,
    updates: { status?: string; retryCount?: number; lastRetryAt?: Date },
): boolean {
    const db = getDatabase();

    const setClauses: string[] = [];
    const params: (string | number)[] = [];

    if (updates.status) {
        setClauses.push('status = ?');
        params.push(updates.status);
    }
    if (updates.retryCount !== undefined) {
        setClauses.push('retry_count = ?');
        params.push(updates.retryCount);
    }
    if (updates.lastRetryAt) {
        setClauses.push('last_retry_at = ?');
        params.push(updates.lastRetryAt.toISOString());
    }

    if (setClauses.length === 0) return false;

    params.push(id);
    const result = db
        .prepare(`UPDATE failed_transactions SET ${setClauses.join(', ')} WHERE id = ?`)
        .run(...params);

    return result.changes > 0;
}

/**
 * Get count of failed transactions by status
 */
export function getFailedTransactionCounts(): { failed: number; retrying: number; resolved: number; dismissed: number } {
    const db = getDatabase();

    const rows = db
        .prepare('SELECT status, COUNT(*) as count FROM failed_transactions GROUP BY status')
        .all() as { status: string; count: number }[];

    const counts = { failed: 0, retrying: 0, resolved: 0, dismissed: 0 };
    for (const row of rows) {
        if (row.status in counts) {
            counts[row.status as keyof typeof counts] = row.count;
        }
    }

    return counts;
}
