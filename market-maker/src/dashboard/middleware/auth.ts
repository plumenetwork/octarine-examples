/**
 * Basic HTTP authentication middleware
 */

import { Request, Response, NextFunction } from 'express';

export interface AuthConfig {
    username: string;
    password: string;
}

/**
 * Create basic auth middleware
 */
export function createBasicAuthMiddleware(config: AuthConfig) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
            res.set('WWW-Authenticate', 'Basic realm="Market Maker Dashboard"');
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        try {
            const base64Credentials = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
            const [username, password] = credentials.split(':');

            if (username !== config.username || password !== config.password) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }

            next();
        } catch {
            res.status(401).json({ error: 'Invalid authorization header' });
        }
    };
}
