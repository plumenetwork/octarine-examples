import axios from 'axios';
import { ethers } from 'ethers';

const API_BASE_URL = 'https://api.mysticfinance.xyz'; // Hardcoded for demo

export async function createQuoteRequest(params: any) {
    const response = await axios.post(
        `${API_BASE_URL}/octarine/swap`,
        {
            walletAddress: params.walletAddress,
            redeemAsset: params.redeemAsset,
            redemptionAsset: params.redemptionAsset,
            amount: params.amount,
            chainId: params.chainId,
            slippageTolerance: 1,
        }
    );
    return response.data;
}

export async function executeTransaction(txnData: any, signer: ethers.Signer) {
    const tx = await signer.sendTransaction({
        to: txnData.to,
        data: txnData.data,
        value: txnData.value,
    });
    await tx.wait();
    return tx.hash;
}

export async function recordFill(requestId: string, txHash: string, filledAmount: string, marketMaker: string, bidId?: string) {
    try {
        await axios.post(`${API_BASE_URL}/octarine/fill`, {
            requestId, bidId, txHash, filledAmount, marketMaker
        });
    } catch (e) {
        console.error("Failed to record fill", e);
    }
}

export async function pollForBids(requestId: string, signer: ethers.Signer) {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const response = await axios.get(`${API_BASE_URL}/octarine/swap/${requestId}`);
            const { bids } = response.data;

            if (bids && bids.length > 0) {
                const selectedBid = bids[0]; // Auto-select best
                if (!selectedBid.txn) throw new Error("No txn data in bid");

                const txHash = await executeTransaction(selectedBid.txn, signer);

                // Record fill
                await recordFill(requestId, txHash, selectedBid.takerAmount, selectedBid.marketMaker, selectedBid.bidId);

                return { success: true, txHash };
            }
        } catch (e) {
            console.error(e);
        }
        await new Promise(r => setTimeout(r, 15000));
    }
    return { success: false, error: 'Timeout' };
}
