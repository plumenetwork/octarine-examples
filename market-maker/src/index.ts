import { startBiddingLoop } from './instant-redemption-bidding';
import { startLiquidationMonitor } from './liquidation-trigger';

async function main() {
    console.log('🚀 Starting Unified Market Maker Bot');

    // Run both loops concurrently. 
    // We use Promise.all to start them, but since they are infinite loops, 
    // this promise will technically never resolve unless one crashes.
    await Promise.all([
        startBiddingLoop(),
        startLiquidationMonitor(),
    ]);
}

if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Unified Bot crashed:', error);
        process.exit(1);
    });
}
