/**
 * Liquidation API service
 */

import { getApiClient } from './client';
import { Liquidation, TriggerLiquidationRequest, PaginatedApiResponse, ApiResponse, LiquidationBidResponse } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('liquidation-api');

export interface GetLiquidationsParams {
    supportedChains: number[];
    limit?: number;
}

/**
 * Fetch a single page of liquidation opportunities
 */
async function fetchLiquidationsPage(
    page: number,
    limit: number,
    chainId?: number,
): Promise<PaginatedApiResponse<Liquidation>> {
    const client = getApiClient();

    const params: Record<string, number> = { limit, page };
    if (chainId) params.chainId = chainId;

    const response = await client.get<PaginatedApiResponse<Liquidation>>(
        '/octarine/liquidations/opportunities',
        { params, timeout: 120000 },
    );

    return response;
}

/**
 * Get open liquidation opportunities
 * Fetches all pages from the API
 */
export async function getOpenLiquidations(params: GetLiquidationsParams): Promise<Liquidation[]> {
    const limit = params.limit || 1000;

    try {
        // Fetch first page
        const firstPage = await fetchLiquidationsPage(1, limit);
        const allLiquidations: Liquidation[] = [...(firstPage.data || [])];
        const totalItems = firstPage.totalItems || allLiquidations.length;
        const totalPages = Math.ceil(totalItems / limit);

        // Fetch remaining pages
        for (let page = 2; page <= totalPages; page++) {
            const pageResult = await fetchLiquidationsPage(page, limit);
            if (pageResult.data?.length) {
                allLiquidations.push(...pageResult.data);
            }
            logger.debug('Fetched liquidation page', { page, totalPages, count: pageResult.data?.length || 0 });
        }

        // Filter by supported chains locally
        const filtered = allLiquidations.filter(liq =>
            params.supportedChains.includes(Number(liq.chainId)),
        );

        logger.info('Fetched liquidation opportunities', {
            total: allLiquidations.length,
            totalItems,
            pages: totalPages,
            filtered: filtered.length,
        });

        return filtered;
    } catch (error) {
        // Fall back to fetching per chain
        logger.debug('Falling back to per-chain fetch for liquidations');
        return getOpenLiquidationsPerChain(params);
    }
}

/**
 * Fallback: fetch liquidations per chain
 */
async function getOpenLiquidationsPerChain(params: GetLiquidationsParams): Promise<Liquidation[]> {
    const limit = params.limit || 1000;
    const allLiquidations: Liquidation[] = [];

    for (const chainId of params.supportedChains) {
        try {
            const firstPage = await fetchLiquidationsPage(1, limit, chainId);
            allLiquidations.push(...(firstPage.data || []));
            const totalPages = Math.ceil((firstPage.totalItems || 0) / limit);

            for (let page = 2; page <= totalPages; page++) {
                const pageResult = await fetchLiquidationsPage(page, limit, chainId);
                if (pageResult.data?.length) {
                    allLiquidations.push(...pageResult.data);
                }
            }

            logger.debug('Fetched liquidations for chain', {
                chainId,
                count: allLiquidations.length,
            });
        } catch (error) {
            logger.warn('Failed to fetch liquidations for chain', {
                chainId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return allLiquidations;
}

/**
 * Trigger a liquidation (submit bid)
 * Returns the bid data — txHash is NOT available immediately.
 * The backend executes the bid asynchronously; poll getLiquidationStatus() for txHash.
 */
export async function triggerLiquidation(
    params: TriggerLiquidationRequest,
): Promise<{ bidId: string; status: string }> {
    const client = getApiClient();

    logger.info('Triggering liquidation', {
        liquidationId: params.liquidationId,
        marketMaker: params.marketMaker,
        debtAmount: params.debtAmountToLiquidate,
    });

    // Use postOnce — do not auto-retry liquidation bids.
    const response = await client.postOnce<ApiResponse<LiquidationBidResponse>>(
        '/octarine/liquidations/bid',
        params,
    );

    const bid = response.data;

    logger.info('Liquidation bid submitted', {
        liquidationId: params.liquidationId,
        bidId: bid?.bidId,
        status: bid?.status,
    });

    return { bidId: bid?.bidId || '', status: bid?.status || 'pending' };
}

/**
 * Get liquidation status from the API (for polling txHash after bid)
 */
export async function getLiquidationStatus(
    liquidationId: string,
): Promise<{ status: string; txHash?: string } | null> {
    const client = getApiClient();

    try {
        const response = await client.getOnce<ApiResponse<{
            _id: string;
            status: string;
            transactionHash?: string;
            txHash?: string;
        }>>(
            `/octarine/liquidations/${liquidationId}`,
            { timeout: 15000 },
        );

        const data = response.data;
        return {
            status: data?.status || 'unknown',
            txHash: data?.transactionHash || data?.txHash,
        };
    } catch (error) {
        logger.debug('Failed to poll liquidation status', {
            liquidationId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Fetch all opportunities with pagination (for DB sync)
 */
export async function fetchAllOpportunities(
    limit = 1000,
): Promise<{ liquidations: Liquidation[]; totalItems: number }> {
    const firstPage = await fetchLiquidationsPage(1, limit);
    const all: Liquidation[] = [...(firstPage.data || [])];
    const totalItems = firstPage.totalItems || all.length;
    const totalPages = Math.ceil(totalItems / limit);

    for (let page = 2; page <= totalPages; page++) {
        const pageResult = await fetchLiquidationsPage(page, limit);
        if (pageResult.data?.length) {
            all.push(...pageResult.data);
        }
        logger.info('Sync: fetched page', { page, totalPages, count: pageResult.data?.length || 0 });
    }

    return { liquidations: all, totalItems };
}
