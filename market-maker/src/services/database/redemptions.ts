/**
 * Redemption database operations
 */

import { getDatabase } from './index';
import { RedemptionRow } from './schema';

export interface InsertRedemptionData {
    requestId: string;
    bidId?: string;
    maker: string;
    makerAmount: string;
    redeemAsset: string;
    redemptionAsset: string;
    redeemAmount: string;
    chainId: number;
    userAddress?: string;
    spread?: number;
    estimatedProfit?: string;
}

export interface UpdateRedemptionData {
    status?: string;
    txHash?: string;
    transformedAt?: Date;
    estimatedProfit?: string;
}

/**
 * Insert a new redemption record
 */
export function insertRedemption(data: InsertRedemptionData): number {
    const db = getDatabase();

    const stmt = db.prepare(`
        INSERT INTO redemptions (
            request_id, bid_id, maker, maker_amount, redeem_asset,
            redemption_asset, redeem_amount, chain_id, user_address,
            spread, estimated_profit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        data.requestId,
        data.bidId || null,
        data.maker,
        data.makerAmount,
        data.redeemAsset,
        data.redemptionAsset,
        data.redeemAmount,
        data.chainId,
        data.userAddress || null,
        data.spread || null,
        data.estimatedProfit || null,
    );

    return result.lastInsertRowid as number;
}

/**
 * Update a redemption record by request ID
 */
export function updateRedemption(requestId: string, data: UpdateRedemptionData): boolean {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
    }
    if (data.txHash !== undefined) {
        updates.push('tx_hash = ?');
        values.push(data.txHash);
    }
    if (data.transformedAt !== undefined) {
        updates.push('transformed_at = ?');
        values.push(data.transformedAt.toISOString());
    }
    if (data.estimatedProfit !== undefined) {
        updates.push('estimated_profit = ?');
        values.push(data.estimatedProfit);
    }

    if (updates.length === 0) return false;

    values.push(requestId);

    const stmt = db.prepare(`
        UPDATE redemptions SET ${updates.join(', ')} WHERE request_id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
}

/**
 * Get a redemption by request ID
 */
export function getRedemptionByRequestId(requestId: string): RedemptionRow | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM redemptions WHERE request_id = ?');
    return stmt.get(requestId) as RedemptionRow | undefined;
}

export interface GetRedemptionsOptions {
    period?: '7d' | '30d' | 'all';
    chainId?: number;
    status?: string;
    limit?: number;
    offset?: number;
}

/**
 * Get redemptions with filtering and pagination
 */
export function getRedemptions(options: GetRedemptionsOptions = {}): { data: RedemptionRow[]; total: number } {
    const db = getDatabase();
    const { period = '7d', chainId, status, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Period filter
    if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        conditions.push(`created_at >= datetime('now', '-${days} days')`);
    }

    // Chain filter
    if (chainId !== undefined) {
        conditions.push('chain_id = ?');
        params.push(chainId);
    }

    // Status filter
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM redemptions ${whereClause}`);
    const { count } = countStmt.get(...params) as { count: number };

    // Get paginated data
    const dataStmt = db.prepare(`
        SELECT * FROM redemptions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `);

    const data = dataStmt.all(...params, limit, offset) as RedemptionRow[];

    return { data, total: count };
}
