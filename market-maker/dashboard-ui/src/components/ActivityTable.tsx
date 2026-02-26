import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { apiClient } from '../api/client';
import type { Redemption, Liquidation } from '../types';

interface ActivityTableProps {
    redemptions: Redemption[] | undefined;
    liquidations: Liquidation[] | undefined;
    liquidationsTotal?: number;
    isLoading: boolean;
    onPendingChecked?: () => void;
}

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

function shortenAddress(addr: string | null | undefined): string {
    if (!addr) return '-';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function HealthBadge({ factor }: { factor: number | null | undefined }) {
    if (factor == null) return <span className="text-gray-400">-</span>;
    const color = factor < 0.5
        ? 'text-red-600'
        : factor < 1
        ? 'text-orange-600'
        : 'text-green-600';
    return <span className={`font-medium ${color}`}>{factor.toFixed(4)}</span>;
}

function CopyableId({ value, display }: { value: string; display?: string }) {
    const [copied, setCopied] = useState(false);
    const handleClick = () => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button
            onClick={handleClick}
            className="text-gray-600 hover:text-blue-600 cursor-pointer transition-colors"
            title={`Click to copy: ${value}`}
        >
            {copied ? (
                <span className="text-green-600">copied!</span>
            ) : (
                <>{display || `${value.slice(0, 8)}...`}</>
            )}
        </button>
    );
}

function AddressLink({ address }: { address: string | null | undefined }) {
    if (!address) return <span className="text-gray-400">-</span>;
    return (
        <a
            href={`https://explorer.plume.org/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
            title={address}
        >
            {shortenAddress(address)}
        </a>
    );
}

const STATUS_STYLES: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    triggered: 'bg-green-100 text-green-700',
    executed: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: string }) {
    const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-600';
    return (
        <span className={`px-2 py-1 rounded text-xs ${style}`}>
            {status}
        </span>
    );
}

interface LiquidationGroup {
    debtAssetSymbol: string;
    collateralAssetSymbol: string;
    totalBorrowed: number;
    totalCollateral: number;
    items: Liquidation[];
}

function groupLiquidations(liquidations: Liquidation[]): LiquidationGroup[] {
    const groups = new Map<string, LiquidationGroup>();

    for (const l of liquidations) {
        const debtSymbol = l.debtAssetSymbol || 'Unknown';
        const collateralSymbol = l.collateralAssetSymbol || 'Unknown';
        const key = `${debtSymbol}/${collateralSymbol}`;

        let group = groups.get(key);
        if (!group) {
            group = {
                debtAssetSymbol: debtSymbol,
                collateralAssetSymbol: collateralSymbol,
                totalBorrowed: 0,
                totalCollateral: 0,
                items: [],
            };
            groups.set(key, group);
        }

        group.totalBorrowed += parseFloat(l.borrowedAmount || '0') || 0;
        group.totalCollateral += parseFloat(l.collateralAmount || '0') || 0;
        group.items.push(l);
    }

    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
}

function LiquidationGroupTable({ group }: { group: LiquidationGroup }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="border rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full bg-purple-50 px-4 py-3 flex items-center justify-between hover:bg-purple-100 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                        {group.debtAssetSymbol} / {group.collateralAssetSymbol}
                    </span>
                    <span className="text-sm text-gray-600">
                        {group.items.length} liquidation{group.items.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                        Total debt: <span className="font-medium text-gray-700">{formatNum(String(group.totalBorrowed))}</span> {group.debtAssetSymbol}
                    </span>
                    <span className="text-gray-500">
                        Total collateral: <span className="font-medium text-gray-700">{formatNum(String(group.totalCollateral))}</span> {group.collateralAssetSymbol}
                    </span>
                </div>
            </button>
            {open && (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b bg-gray-50">
                            <th className="px-4 py-2">Liquidation</th>
                            <th className="px-4 py-2">Borrower</th>
                            <th className="px-4 py-2">Debt</th>
                            <th className="px-4 py-2">Collateral</th>
                            <th className="px-4 py-2">Health</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Time</th>
                            <th className="px-4 py-2">TX</th>
                        </tr>
                    </thead>
                    <tbody>
                        {group.items.map((l) => (
                            <tr key={`${l.liquidationId}-${l.id}`} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="px-4 py-2 font-mono text-xs">
                                    <CopyableId value={l.liquidationId} />
                                </td>
                                <td className="px-4 py-2 font-mono text-xs">
                                    <AddressLink address={l.borrower} />
                                </td>
                                <td className="px-4 py-2">
                                    {formatNum(l.borrowedAmount)}
                                </td>
                                <td className="px-4 py-2">
                                    {formatNum(l.collateralAmount)}
                                </td>
                                <td className="px-4 py-2">
                                    <HealthBadge factor={l.healthFactor} />
                                </td>
                                <td className="px-4 py-2">
                                    <StatusBadge status={l.status} />
                                </td>
                                <td className="px-4 py-2 text-gray-500">
                                    {format(parseISO(l.createdAt), 'MMM d, HH:mm')}
                                </td>
                                <td className="px-4 py-2">
                                    {l.txHash ? (
                                        <a
                                            href={`https://explorer.plume.org/tx/${l.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline font-mono text-xs"
                                        >
                                            {shortenAddress(l.txHash)}
                                        </a>
                                    ) : (
                                        '-'
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export function ActivityTable({ redemptions, liquidations, liquidationsTotal, isLoading, onPendingChecked }: ActivityTableProps) {
    const [checkingPending, setCheckingPending] = useState(false);
    const [pendingResult, setPendingResult] = useState<string | null>(null);
    const [triggerInput, setTriggerInput] = useState('');
    const [triggering, setTriggering] = useState(false);
    const [triggerResult, setTriggerResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const autoCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const sortedLiquidations = [...(liquidations || [])]
        .filter(l => l.status !== 'expired')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pendingCount = sortedLiquidations.filter(l => l.status === 'pending').length;

    const handleCheckPending = useCallback(async () => {
        setCheckingPending(true);
        setPendingResult(null);
        try {
            const res = await apiClient.checkPendingLiquidations();
            setPendingResult(`Checked ${res.checked}, updated ${res.updated.length}`);
            if (res.updated.length > 0) {
                onPendingChecked?.();
            }
        } catch (err) {
            setPendingResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        setCheckingPending(false);
    }, [onPendingChecked]);

    // Auto-check pending every 60s when there are pending items
    useEffect(() => {
        if (pendingCount > 0) {
            autoCheckRef.current = setInterval(handleCheckPending, 60_000);
        }
        return () => {
            if (autoCheckRef.current) clearInterval(autoCheckRef.current);
        };
    }, [pendingCount, handleCheckPending]);

    const handleTrigger = async () => {
        const id = triggerInput.trim();
        if (!id) return;
        setTriggering(true);
        setTriggerResult(null);
        try {
            const res = await apiClient.triggerLiquidation(id);
            if (res.success) {
                setTriggerResult({ type: 'success', message: `Bid submitted: ${res.bidId} (${res.status})` });
                setTriggerInput('');
                onPendingChecked?.();
            } else {
                setTriggerResult({ type: 'error', message: res.message || res.error || 'Trigger failed' });
            }
        } catch (err) {
            setTriggerResult({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        }
        setTriggering(false);
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    const sortedRedemptions = [...(redemptions || [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);

    const liquidationGroups = groupLiquidations(sortedLiquidations);

    const hasRedemptions = sortedRedemptions.length > 0;
    const hasLiquidations = liquidationGroups.length > 0;

    if (!hasRedemptions && !hasLiquidations) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                <p className="text-gray-500 text-center py-8">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Liquidations grouped by debt asset */}
            {hasLiquidations && (
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                            Liquidations
                            <span className="text-sm font-normal text-gray-500 ml-2">
                                {liquidationsTotal ?? sortedLiquidations.length} total across {liquidationGroups.length} market{liquidationGroups.length !== 1 ? 's' : ''}
                            </span>
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCheckPending}
                                disabled={checkingPending || pendingCount === 0}
                                className="px-3 py-1.5 text-xs rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50 transition-colors"
                            >
                                {checkingPending ? 'Checking...' : `Check Pending (${pendingCount})`}
                            </button>
                            {pendingResult && (
                                <span className="text-xs text-gray-500">{pendingResult}</span>
                            )}
                        </div>
                    </div>

                    {/* Manual trigger */}
                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="text"
                            value={triggerInput}
                            onChange={e => setTriggerInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleTrigger()}
                            placeholder="Liquidation ID to trigger..."
                            className="flex-1 max-w-md px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono"
                        />
                        <button
                            onClick={handleTrigger}
                            disabled={triggering || !triggerInput.trim()}
                            className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                            {triggering ? 'Triggering...' : 'Trigger'}
                        </button>
                        {triggerResult && (
                            <span className={`text-xs ${triggerResult.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                {triggerResult.message}
                            </span>
                        )}
                    </div>

                    <div className="space-y-4">
                        {liquidationGroups.map((group) => (
                            <LiquidationGroupTable
                                key={`${group.debtAssetSymbol}/${group.collateralAssetSymbol}`}
                                group={group}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Redemptions */}
            {hasRedemptions && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">
                        Redemptions
                        <span className="text-sm font-normal text-gray-500 ml-2">
                            {sortedRedemptions.length} total
                        </span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-2">Amount</th>
                                    <th className="pb-2">Status</th>
                                    <th className="pb-2">Chain</th>
                                    <th className="pb-2">Time</th>
                                    <th className="pb-2">TX</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRedemptions.map((r) => (
                                    <tr key={r.requestId} className="border-b last:border-0">
                                        <td className="py-3">
                                            <div className="font-medium">
                                                {formatNum(r.redeemAmount)}{' '}
                                                <span className="text-gray-500">redeem</span>
                                            </div>
                                            <div className="text-xs text-gray-400 font-mono">
                                                {shortenAddress(r.requestId)}
                                            </div>
                                        </td>
                                        <td className="py-3">
                                            <span
                                                className={`px-2 py-1 rounded text-xs ${
                                                    r.status === 'transformed'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}
                                            >
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="py-3">{r.chainId}</td>
                                        <td className="py-3 text-gray-500">
                                            {format(parseISO(r.createdAt), 'MMM d, HH:mm')}
                                        </td>
                                        <td className="py-3">
                                            {r.txHash ? (
                                                <a
                                                    href={`https://explorer.plume.org/tx/${r.txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline font-mono text-xs"
                                                >
                                                    {shortenAddress(r.txHash)}
                                                </a>
                                            ) : (
                                                '-'
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
