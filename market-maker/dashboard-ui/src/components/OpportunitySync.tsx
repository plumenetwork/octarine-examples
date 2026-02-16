import { useState, useEffect, useCallback } from 'react';
import { apiClient, SyncStatus } from '../api/client';

export function OpportunitySync() {
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const s = await apiClient.getOpportunitySyncStatus();
            setStatus(s);
            setSyncing(s.syncInProgress);
        } catch {
            // ignore polling errors
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, syncing ? 3000 : 30000);
        return () => clearInterval(interval);
    }, [fetchStatus, syncing]);

    const handleSync = async () => {
        setSyncing(true);
        setError(null);
        try {
            await apiClient.triggerOpportunitySync();
            // Poll more frequently while syncing
            const poll = setInterval(async () => {
                const s = await apiClient.getOpportunitySyncStatus();
                setStatus(s);
                if (!s.syncInProgress) {
                    setSyncing(false);
                    clearInterval(poll);
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
        </div>
    );
}
