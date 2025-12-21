import { ethers } from 'ethers';

// Unlimited approval to Exchange Proxy (spender) from rfqRequest.metadata
export async function approveTokenToExchangeProxy(
    exchangeProxy: string,
    amount: string,
    token: string,
    signer: ethers.Signer,
) {
    if (!exchangeProxy) throw new Error('exchangeProxy missing');

    const erc20 = new ethers.Contract(
        token,
        [
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function decimals() view returns (uint8)',
        ],
        signer,
    );

    const owner = await signer.getAddress();
    const current = await erc20.allowance(owner, exchangeProxy);
    if (Number(current.toString()) > +amount) return { txHash: null, alreadyApproved: true };

    const tx = await erc20.approve(exchangeProxy, ethers.constants.MaxUint256);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash, alreadyApproved: false };
}
