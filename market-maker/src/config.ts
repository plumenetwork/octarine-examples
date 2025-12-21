import * as dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
    API_BASE_URL: process.env.API_BASE_URL || 'https://api.mysticfinance.xyz',
    API_KEY: process.env.MARKET_MAKER_API_KEY || '',
    PRIVATE_KEY: process.env.PRIVATE_KEY || '',
    MARKET_MAKER_ADDRESS: process.env.MARKET_MAKER_ADDRESS || '',
    RPC_URL: process.env.RPC_URL || 'https://rpc.plume.org',

    // Strategy settings
    ACCEPTED_TOKENS: (process.env.ACCEPTED_TOKENS || '*').split(',').map(t => t.trim()),
    PRICE_SPREAD: parseFloat(process.env.PRICE_SPREAD || '0.98'),
    MIN_BID_AMOUNT_WEI: process.env.MIN_BID_AMOUNT_WEI || '100',
    SUPPORTED_CHAINS: (process.env.SUPPORTED_CHAINS || '98866').split(',').map(c => parseInt(c.trim())),

    // Poll intervals
    BIDDING_POLL_INTERVAL_MS: 5000,
    LIQUIDATION_POLL_INTERVAL_MS: 10000,
};

if (!CONFIG.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
if (!CONFIG.MARKET_MAKER_ADDRESS) throw new Error('MARKET_MAKER_ADDRESS not set in .env');
