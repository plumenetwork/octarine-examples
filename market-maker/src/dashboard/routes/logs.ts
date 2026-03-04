/**
 * SSE endpoint for streaming log entries to the dashboard
 */

import { Router, Request, Response } from 'express';
import { logBroadcaster, BroadcastLogEntry } from '../../utils/logger';

const router = Router();

router.get('/stream', (req: Request, res: Response) => {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Send buffered history
    const history = logBroadcaster.getBuffer();
    for (const entry of history) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    // Stream new entries
    const onLog = (entry: BroadcastLogEntry) => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
    };

    logBroadcaster.on('log', onLog);

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
    }, 30_000);

    // Cleanup on disconnect
    req.on('close', () => {
        logBroadcaster.off('log', onLog);
        clearInterval(keepAlive);
    });
});

export { router as logsRoutes };
