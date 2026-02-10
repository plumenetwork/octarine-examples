import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { FailedTransaction, FailedTransactionCounts } from '../types';
import { useRetryFailedTransaction, useDismissFailedTransaction } from '../hooks/useFailedTransactions';

interface FailedTransactionsTableProps {
    transactions: FailedTransaction[] | undefined;
    counts: FailedTransactionCounts | undefined;
    isLoading: boolean;
}

function shortenHash(hash: string | null): string {
    if (!hash) return '-';
    return hash.slice(0, 6) + '...' + hash.slice(-4);
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        failed: 'bg-red-100 text-red-700',
        retrying: 'bg-yellow-100 text-yellow-700',
        resolved: 'bg-green-100 text-green-700',
        dismissed: 'bg-gray-100 text-gray-500',
    };

    return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.failed}`}>
            {status}
        </span>
    );
}

export function FailedTransactionsTable({ transactions, counts, isLoading }: FailedTransactionsTableProps) {
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const retryMutation = useRetryFailedTransaction();
    const dismissMutation = useDismissFailedTransaction();

    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    const failedCount = (counts?.failed || 0) + (counts?.retrying || 0);

    if (!transactions || transactions.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">
                    Failed Transactions
                    {failedCount === 0 && (
                        <span className="ml-2 text-sm font-normal text-green-600">All clear</span>
                    )}
                </h3>
                <p className="text-gray-500 text-center py-8">No failed transactions</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                    Failed Transactions
                    {failedCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-sm rounded-full">
                            {failedCount}
                        </span>
                    )}
                </h3>
                {counts && (
                    <div className="flex gap-3 text-xs text-gray-500">
                        <span>Failed: {counts.failed}</span>
                        <span>Retrying: {counts.retrying}</span>
                        <span>Resolved: {counts.resolved}</span>
                        <span>Dismissed: {counts.dismissed}</span>
                    </div>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2">Operation</th>
                            <th className="pb-2">Error</th>
                            <th className="pb-2">Reference</th>
                            <th className="pb-2">Status</th>
                            <th className="pb-2">Time</th>
                            <th className="pb-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((tx) => (
                            <>
                                <tr
                                    key={tx.id}
                                    className="border-b last:border-0 cursor-pointer hover:bg-gray-50"
                                    onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                                >
                                    <td className="py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                tx.errorType === 'tx_failure'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-orange-100 text-orange-700'
                                            }`}>
                                                {tx.errorType === 'tx_failure' ? 'TX' : 'API'}
                                            </span>
                                            <span className="font-medium">{tx.operation}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 max-w-xs truncate text-gray-600" title={tx.errorMessage}>
                                        {tx.errorMessage.length > 60
                                            ? tx.errorMessage.slice(0, 60) + '...'
                                            : tx.errorMessage}
                                    </td>
                                    <td className="py-3 font-mono text-xs">
                                        {tx.requestId
                                            ? shortenHash(tx.requestId)
                                            : tx.liquidationId
                                            ? shortenHash(tx.liquidationId)
                                            : '-'}
                                    </td>
                                    <td className="py-3">
                                        <StatusBadge status={tx.status} />
                                        {tx.retryCount > 0 && (
                                            <span className="ml-1 text-xs text-gray-400">
                                                x{tx.retryCount}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 text-gray-500">
                                        {format(parseISO(tx.createdAt), 'MMM d, HH:mm')}
                                    </td>
                                    <td className="py-3">
                                        {(tx.status === 'failed' || tx.status === 'retrying') && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        retryMutation.mutate(tx.id);
                                                    }}
                                                    disabled={retryMutation.isPending}
                                                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {retryMutation.isPending ? '...' : 'Retry'}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        dismissMutation.mutate(tx.id);
                                                    }}
                                                    disabled={dismissMutation.isPending}
                                                    className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 disabled:opacity-50"
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                {expandedId === tx.id && (
                                    <tr key={`${tx.id}-detail`} className="border-b bg-gray-50">
                                        <td colSpan={6} className="p-4">
                                            <div className="text-xs space-y-2">
                                                <div>
                                                    <span className="font-semibold text-gray-600">Full Error: </span>
                                                    <span className="text-red-600 break-all">{tx.errorMessage}</span>
                                                </div>
                                                {tx.requestId && (
                                                    <div>
                                                        <span className="font-semibold text-gray-600">Request ID: </span>
                                                        <span className="font-mono">{tx.requestId}</span>
                                                    </div>
                                                )}
                                                {tx.liquidationId && (
                                                    <div>
                                                        <span className="font-semibold text-gray-600">Liquidation ID: </span>
                                                        <span className="font-mono">{tx.liquidationId}</span>
                                                    </div>
                                                )}
                                                {tx.chainId && (
                                                    <div>
                                                        <span className="font-semibold text-gray-600">Chain ID: </span>
                                                        <span>{tx.chainId}</span>
                                                    </div>
                                                )}
                                                {tx.txHash && (
                                                    <div>
                                                        <span className="font-semibold text-gray-600">TX Hash: </span>
                                                        <span className="font-mono">{tx.txHash}</span>
                                                    </div>
                                                )}
                                                {tx.lastRetryAt && (
                                                    <div>
                                                        <span className="font-semibold text-gray-600">Last Retry: </span>
                                                        <span>{format(parseISO(tx.lastRetryAt), 'MMM d, HH:mm:ss')}</span>
                                                    </div>
                                                )}
                                                {tx.context && Object.keys(tx.context).length > 0 && (
                                                    <div>
                                                        <span className="font-semibold text-gray-600">Context: </span>
                                                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                                                            {JSON.stringify(tx.context, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </>
                        ))}
                    </tbody>
                </table>
            </div>

            {retryMutation.isError && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    Retry failed: {retryMutation.error?.message || 'Unknown error'}
                </div>
            )}
            {retryMutation.isSuccess && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                    {retryMutation.data?.message}
                </div>
            )}
        </div>
    );
}
