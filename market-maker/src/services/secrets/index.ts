/**
 * Google Secret Manager integration
 * Fetches sensitive credentials from GCP Secret Manager
 *
 * Secret naming convention: MYSTIC_LST_MARKET_MAKER_{VARIABLE_NAME}
 * e.g., MYSTIC_LST_MARKET_MAKER_PRIVATE_KEY
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const SECRET_PREFIX = 'MYSTIC_LST_MARKET_MAKER';

export interface SecretConfig {
    gcpProjectId: string;
    useSecretManager: boolean;
}

export interface Secrets {
    privateKey: string;
    apiKey: string;
}

/**
 * Build the full secret name for GCP Secret Manager
 */
function buildSecretName(projectId: string, secretName: string): string {
    const fullSecretName = `${SECRET_PREFIX}_${secretName}`;
    return `projects/${projectId}/secrets/${fullSecretName}/versions/latest`;
}

/**
 * Fetch a single secret from Google Secret Manager
 */
async function fetchSecret(
    client: SecretManagerServiceClient,
    projectId: string,
    secretName: string,
): Promise<string> {
    const name = buildSecretName(projectId, secretName);

    try {
        const [version] = await client.accessSecretVersion({ name });
        const payload = version.payload?.data;

        if (!payload) {
            throw new Error(`Secret ${secretName} has no payload`);
        }

        // Handle both string and Uint8Array payloads
        if (typeof payload === 'string') {
            return payload;
        }
        return Buffer.from(payload).toString('utf8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch secret ${SECRET_PREFIX}_${secretName}: ${message}`);
    }
}

/**
 * Fetch all required secrets from Google Secret Manager
 */
export async function fetchSecrets(config: SecretConfig): Promise<Secrets> {
    if (!config.useSecretManager) {
        throw new Error('Secret Manager is not enabled');
    }

    if (!config.gcpProjectId) {
        throw new Error('GCP_PROJECT_ID is required when USE_SECRET_MANAGER is enabled');
    }

    const client = new SecretManagerServiceClient();

    console.log(`📦 Fetching secrets from Google Secret Manager (project: ${config.gcpProjectId})`);

    const [privateKey, apiKey] = await Promise.all([
        fetchSecret(client, config.gcpProjectId, 'PRIVATE_KEY'),
        fetchSecret(client, config.gcpProjectId, 'API_KEY').catch(() => ''), // API key is optional
    ]);

    console.log('✅ Secrets loaded from Secret Manager');

    return {
        privateKey,
        apiKey,
    };
}

/**
 * Get secrets either from Secret Manager or environment variables
 * Falls back to env vars if Secret Manager is not enabled
 */
export async function getSecrets(config: SecretConfig): Promise<Secrets> {
    if (config.useSecretManager) {
        return fetchSecrets(config);
    }

    // Fall back to environment variables
    return {
        privateKey: process.env.PRIVATE_KEY || '',
        apiKey: process.env.MARKET_MAKER_API_KEY || '',
    };
}

/**
 * Validate that required secrets are present
 */
export function validateSecrets(secrets: Secrets): string[] {
    const errors: string[] = [];

    if (!secrets.privateKey) {
        errors.push('PRIVATE_KEY is required (either in .env or Secret Manager)');
    }

    // Validate private key format
    if (secrets.privateKey) {
        const key = secrets.privateKey.startsWith('0x')
            ? secrets.privateKey.slice(2)
            : secrets.privateKey;
        if (!/^[a-fA-F0-9]{64}$/.test(key)) {
            errors.push('PRIVATE_KEY must be a valid 32-byte hex string');
        }
    }

    return errors;
}
