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

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    );
}

export function FailedTransactionsTable({ transactions, counts, isLoading }: FailedTransactionsTableProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const retryMutation = useRetryFailedTransaction();
    const dismissMutation = useDismissFailedTransaction();

    const failedCount = (counts?.failed || 0) + (counts?.retrying || 0);
    const totalCount = transactions?.length || 0;

    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow">
                <div className="p-4 animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-1/4"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow">
            {/* Accordion header — always visible */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-lg"
            >
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-left">Failed Transactions</h3>
                    {failedCount > 0 ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                            {failedCount}
                        </span>
                    ) : (
                        <span className="text-sm text-green-600">All clear</span>
                    )}
                    {totalCount > 0 && counts && (
                        <div className="hidden sm:flex gap-3 text-xs text-gray-400 ml-2">
                            {counts.failed > 0 && <span>{counts.failed} failed</span>}
                            {counts.retrying > 0 && <span>{counts.retrying} retrying</span>}
                            {counts.resolved > 0 && <span>{counts.resolved} resolved</span>}
                            {counts.dismissed > 0 && <span>{counts.dismissed} dismissed</span>}
                        </div>
                    )}
                </div>
                <ChevronIcon open={isOpen} />
            </button>

            {/* Accordion content */}
            <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
            >
                <div className="px-6 pb-6">
                    {(!transactions || transactions.length === 0) ? (
                        <p className="text-gray-500 text-center py-6">No failed transactions</p>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
