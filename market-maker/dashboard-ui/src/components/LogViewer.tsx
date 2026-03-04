import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';

interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    module: string;
    message: string;
    context?: Record<string, unknown>;
    error?: { name: string; message: string };
}

const LEVEL_COLORS: Record<string, string> = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-gray-500',
};

const LEVEL_BG: Record<string, string> = {
    error: 'bg-red-900/20',
    warn: 'bg-yellow-900/10',
    info: '',
    debug: '',
};

const MAX_LINES = 500;

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

function formatTime(timestamp: string): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatContext(context?: Record<string, unknown>): Array<[string, string]> | null {
    if (!context) return null;
    // Filter out `module` since it's already displayed as [module]
    const { module: _, ...rest } = context;
    const entries = Object.entries(rest);
    if (entries.length === 0) return null;
    return entries.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
}

export function LogViewer() {
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [connected, setConnected] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const scrollRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Connect SSE when accordion is open
    useEffect(() => {
        if (!isOpen) {
            // Disconnect when closed
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                setConnected(false);
            }
            return;
        }

        const creds = apiClient.getCredentials();
        const url = `/api/logs/stream?auth=${encodeURIComponent(creds)}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => setConnected(true);

        es.onmessage = (event) => {
            try {
                const entry: LogEntry = JSON.parse(event.data);
                setLogs((prev) => {
                    const next = [...prev, entry];
                    return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
                });
            } catch {
                // ignore parse errors
            }
        };

        es.onerror = () => {
            setConnected(false);
        };

        return () => {
            es.close();
            eventSourceRef.current = null;
        };
    }, [isOpen]);

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        // If user scrolled up more than 50px from bottom, disable auto-scroll
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(atBottom);
    }, []);

    const clearLogs = () => setLogs([]);

    const filteredLogs = levelFilter === 'all'
        ? logs
        : logs.filter((l) => l.level === levelFilter);

    const errorCount = logs.filter((l) => l.level === 'error').length;

    return (
        <div className="bg-white rounded-lg shadow">
            {/* Accordion header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-lg"
            >
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-left">Bot Logs</h3>
                    {connected ? (
                        <span className="flex items-center gap-1.5 text-sm text-green-600">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            Live
                        </span>
                    ) : isOpen ? (
                        <span className="text-sm text-yellow-600">Reconnecting...</span>
                    ) : (
                        <span className="text-sm text-gray-400">Expand to connect</span>
                    )}
                    {errorCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                            {errorCount} errors
                        </span>
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
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <select
                                value={levelFilter}
                                onChange={(e) => setLevelFilter(e.target.value)}
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                            >
                                <option value="all">All levels</option>
                                <option value="error">Error</option>
                                <option value="warn">Warn</option>
                                <option value="info">Info</option>
                                <option value="debug">Debug</option>
                            </select>
                            <span className="text-xs text-gray-400">{filteredLogs.length} entries</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoScroll}
                                    onChange={(e) => setAutoScroll(e.target.checked)}
                                    className="rounded"
                                />
                                Auto-scroll
                            </label>
                            <button
                                onClick={clearLogs}
                                className="text-xs text-gray-400 hover:text-gray-600"
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Log output */}
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="bg-gray-900 rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs leading-5 select-text"
                    >
                        {filteredLogs.length === 0 ? (
                            <div className="text-gray-500 text-center py-8">
                                {connected ? 'Waiting for log entries...' : 'Connecting...'}
                            </div>
                        ) : (
                            filteredLogs.map((entry, i) => {
                                const ctx = formatContext(entry.context);
                                return (
                                    <div key={i} className={`${LEVEL_BG[entry.level]} px-1 rounded mb-0.5`}>
                                        <div className="flex gap-2">
                                            <span className="text-gray-600 shrink-0">{formatTime(entry.timestamp)}</span>
                                            <span className={`shrink-0 w-12 ${LEVEL_COLORS[entry.level]}`}>
                                                {entry.level.toUpperCase().padEnd(5)}
                                            </span>
                                            <span className="text-purple-400 shrink-0">[{entry.module}]</span>
                                            <span className="text-gray-300">{entry.message}</span>
                                            {entry.error && (
                                                <span className="text-red-400">| {entry.error.message}</span>
                                            )}
                                        </div>
                                        {ctx && (
                                            <div className="ml-[7.5rem] flex flex-wrap gap-x-3 text-gray-500">
                                                {ctx.map(([key, val]) => (
                                                    <span key={key}>
                                                        <span className="text-gray-200">{key}</span>
                                                        <span className="text-gray-600">=</span>
                                                        <span className="text-gray-400">{val}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
