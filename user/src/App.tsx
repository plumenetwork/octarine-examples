import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { createQuoteRequest, pollForBids, executeTransaction, recordFill } from './services/api'
import { approveToken } from './services/web3'

function App() {
    const [account, setAccount] = useState<string>('')
    const [amount, setAmount] = useState<string>('100')
    const [status, setStatus] = useState<string>('')
    const [logs, setLogs] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    // Default RWA -> pUSD on Plume
    const [redeemAsset, setRedeemAsset] = useState('0x9fbC367B9Bb966a2A537989817A088AFCaFFDC4c')
    const [redemptionAsset, setRedemptionAsset] = useState('0xdddD73F5Df1F0DC31373357beAC77545dC5A6f3F')
    const chainId = 98866

    const log = (msg: string) => setLogs(prev => [...prev, `> ${msg}`])

    useEffect(() => {
        connectWallet()
    }, [])

    async function connectWallet() {
        if (window.ethereum) {
            try {
                const provider = new ethers.providers.Web3Provider(window.ethereum)
                const accounts = await provider.send("eth_requestAccounts", [])
                setAccount(accounts[0])
                log(`Wallet connected: ${accounts[0]}`)
            } catch (err: any) {
                log(`Error connecting wallet: ${err.message}`)
            }
        } else {
            log("Please install MetaMask!")
        }
    }

    async function handleSwap() {
        if (!account) return
        setLoading(true)
        setStatus('Requesting Quote...')
        setLogs([]) // Clear previous logs
        log('🚀 Starting Swap Process...')

        try {
            // 1. Get Quote
            const quote = await createQuoteRequest({
                walletAddress: account,
                redeemAsset,
                redemptionAsset,
                amount,
                chainId,
                type: 'instant_redemption'
            })

            log(`Quote Type: ${quote.type}`)

            // 2. Approve Token
            setStatus('Approving Token...')
            log('📝 Checking/Approving Token...')

            const provider = new ethers.providers.Web3Provider(window.ethereum)
            const signer = provider.getSigner()
            const proxyAddress = quote.quote?.order?.verifyingContract

            await approveToken(proxyAddress, amount, redeemAsset, signer)
            log('✅ Token Approved')

            // 3. Execute Swap
            if (quote.type === 'instant' && quote.quote && quote.txn) {
                setStatus('Executing Instant Swap...')
                log('⚡ Executing Instant Swap...')

                const txHash = await executeTransaction(quote.txn, signer)
                log(`✅ Swap Complete! Tx: ${txHash}`)
                setStatus('Success!')

                if (quote.requestId) {
                    await recordFill(quote.requestId, txHash, amount, quote.quote.marketMaker)
                }

            } else if (quote.type === 'rfq' && quote.requestId) {
                setStatus('Polling for Bids...')
                log('📊 Polling for Bids (RFQ)...')

                const result = await pollForBids(quote.requestId, signer)
                if (result.success && result.txHash) {
                    log(`✅ RFQ Swap Complete! Tx: ${result.txHash}`)
                    setStatus('Success!')
                    // Record fill handles itself in pollForBids for RFQ logic usually, 
                    // but let's check `pollForBids` implementation
                } else {
                    log(`❌ RFQ Failed: ${result.error}`)
                    setStatus('Failed')
                }
            }

        } catch (err: any) {
            log(`❌ Error: ${err.message || err}`)
            setStatus('Error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="App">
            <h1>Octarine Swap</h1>

            <div className="card">
                {!account ? (
                    <button onClick={connectWallet}>Connect Wallet</button>
                ) : (
                    <p>Connected: {account.substring(0, 6)}...{account.substring(38)}</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                    <div>
                        <label>Sell (RWA):</label>
                        <input value={redeemAsset} onChange={e => setRedeemAsset(e.target.value)} />
                    </div>
                    <div>
                        <label>Buy (pUSD):</label>
                        <input value={redemptionAsset} onChange={e => setRedemptionAsset(e.target.value)} />
                    </div>
                    <div>
                        <label>Amount:</label>
                        <input value={amount} onChange={e => setAmount(e.target.value)} />
                    </div>

                    <button disabled={loading || !account} onClick={handleSwap}>
                        {loading ? 'Swapping...' : 'Swap Now'}
                    </button>
                </div>

                {status && <h3>Status: {status}</h3>}

                <div className="status-box">
                    {logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    )
}

export default App
