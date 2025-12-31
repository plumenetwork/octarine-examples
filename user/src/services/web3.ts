import { ethers } from 'ethers';

export async function approveToken(
    spender: string,
    amount: string,
    tokenAddress: string,
    signer: ethers.Signer
) {
    const erc20 = new ethers.Contract(
        tokenAddress,
        [
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
        ],
        signer
    );

    const owner = await signer.getAddress();
    const current = await erc20.allowance(owner, spender);

    if (+(current + '') > +amount) return;

    const tx = await erc20.approve(spender, ethers.constants.MaxUint256);
    await tx.wait();
}
