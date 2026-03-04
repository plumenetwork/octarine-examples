import { useState, useEffect, useCallback } from 'react';
import { apiClient, SyncStatus, MarketBreakdownItem } from '../api/client';

function formatNum(value: string | null | undefined): string {
    if (!value) return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return (num / 1e6).toFixed(2) + 'M';
}

export function OpportunitySync() {
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [markets, setMarkets] = useState<MarketBreakdownItem[]>([]);
    const [marketsLoading, setMarketsLoading] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const s = await apiClient.getOpportunitySyncStatus();
            setStatus(s);
            setSyncing(s.syncInProgress);
        } catch {
            // ignore polling errors
        }
    }, []);

    const fetchMarkets = useCallback(async () => {
        setMarketsLoading(true);
        try {
            const res = await apiClient.getOpportunityMarkets();
            setMarkets(res.markets);
        } catch {
            // ignore market fetch errors
        } finally {
            setMarketsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchMarkets();
        const statusInterval = setInterval(fetchStatus, syncing ? 3000 : 30000);
        const marketsInterval = setInterval(fetchMarkets, 60000);
        return () => {
            clearInterval(statusInterval);
            clearInterval(marketsInterval);
        };
    }, [fetchStatus, fetchMarkets, syncing]);

    const handleSync = async () => {
        setSyncing(true);
        setError(null);
        try {
            await apiClient.triggerOpportunitySync();
            const poll = setInterval(async () => {
                const s = await apiClient.getOpportunitySyncStatus();
                setStatus(s);
                if (!s.syncInProgress) {
                    setSyncing(false);
                    clearInterval(poll);
                    fetchMarkets();
                }
            }, 2000);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Sync failed');
            setSyncing(false);
        }
    };

    const dbCount = status?.dbCount ?? 0;
    const apiTotal = status?.apiTotal;
    const syncRequired = status?.syncRequired ?? false;
    const lastSync = status?.lastSync;

    const actionableMarkets = markets.filter(m => m.sufficientBalance);
    const totalMarkets = markets.length;

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Liquidation Opportunities</h3>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        syncing
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : syncRequired
                            ? 'bg-orange-600 text-white hover:bg-orange-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {syncing ? 'Syncing...' : syncRequired ? 'Sync Required' : 'Sync Now'}
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                    <p className="text-gray-500">DB Records</p>
                    <p className="text-xl font-semibold">{dbCount.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-gray-500">API Total</p>
                    <p className="text-xl font-semibold">
                        {apiTotal != null ? apiTotal.toLocaleString() : '—'}
                    </p>
                </div>
                <div>
                    <p className="text-gray-500">Status</p>
                    <p className={`text-xl font-semibold ${
                        syncing ? 'text-blue-600' : syncRequired ? 'text-orange-600' : 'text-green-600'
                    }`}>
                        {syncing ? 'Syncing' : syncRequired ? 'Out of sync' : 'In sync'}
                    </p>
                </div>
                <div>
                    <p className="text-gray-500">Last Sync</p>
                    <p className="text-sm">
                        {lastSync
                            ? `${new Date(lastSync.syncedAt).toLocaleTimeString()} — +${lastSync.inserted} new, ${lastSync.updated} updated`
                            : 'Never'
                        }
                    </p>
                </div>
            </div>

            {syncing && (
                <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching and syncing all opportunities from the API...
                </div>
            )}

            {error && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Market Breakdown Table */}
            {totalMarkets > 0 && (
                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">
                            Market Breakdown
                            <span className="ml-2 font-normal text-gray-500">
                                {actionableMarkets.length} actionable / {totalMarkets} total markets
                            </span>
                        </h4>
                        {marketsLoading && (
                            <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="pb-2 pr-4">Market</th>
                                    <th className="pb-2 pr-4 text-right">Opportunities</th>
                                    <th className="pb-2 pr-4 text-right">Total Borrowed</th>
                                    <th className="pb-2 pr-4 text-right">Total Collateral</th>
                                    <th className="pb-2 pr-4 text-right">Avg Health</th>
                                    <th className="pb-2 pr-4 text-right">Wallet Balance</th>
                                    <th className="pb-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {markets.map((m) => (
                                    <tr
                                        key={`${m.debtAsset}-${m.collateralAsset}`}
                                        className={`border-b last:border-0 ${
                                            !m.sufficientBalance ? 'opacity-50' : ''
                                        }`}
                                    >
                                        <td className="py-2 pr-4">
                                            <span className="inline-flex items-center gap-1">
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                                    {m.debtAssetSymbol}
                                                </span>
                                                <span className="text-gray-400">/</span>
                                                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-medium">
                                                    {m.collateralAssetSymbol}
                                                </span>
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4 text-right font-medium">
                                            {m.count}
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            {formatNum(m.totalBorrowed)} <span className="text-gray-400">{m.debtAssetSymbol}</span>
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            {formatNum(m.totalCollateral)} <span className="text-gray-400">{m.collateralAssetSymbol}</span>
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            <span className={
                                                m.avgHealthFactor < 0.5
                                                    ? 'text-red-600'
                                                    : m.avgHealthFactor < 0.8
                                                    ? 'text-orange-600'
                                                    : 'text-gray-700'
                                            }>
                                                {m.avgHealthFactor.toFixed(4)}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4 text-right font-mono text-xs">
                                            {m.walletBalance != null
                                                ? formatNum(m.walletBalance)
                                                : <span className="text-gray-400">N/A</span>
                                            }
                                        </td>
                                        <td className="py-2">
                                            {m.sufficientBalance ? (
                                                <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                                                    Ready
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full text-xs font-medium">
                                                    Insufficient balance
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
