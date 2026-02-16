/**
 * Axios API client with retry logic and interceptors
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { AppConfig } from '../../types';
import { withRetry, API_RETRY_DEFAULTS } from '../../utils/retry';
import { createLogger } from '../../utils/logger';
import { throttleManager } from './throttle';

const logger = createLogger('api');

export interface ApiClientConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
}

export function createApiClient(config: ApiClientConfig): AxiosInstance {
    logger.info('Creating API client with base URL: {config.baseUrl}', {baseUrl: config.baseUrl});
    logger.info('Creating API client with apiKey : {config.apiKey}', {apiKey: config.apiKey});
    const client = axios.create({
        baseURL: config.baseUrl,
        timeout: config.timeout || 30000,
        headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { 'x-api-key': config.apiKey || '' } : {}),
        },
    });

    // Request interceptor for logging
    client.interceptors.request.use(
        (requestConfig) => {
            logger.debug('API Request', {
                method: requestConfig.method?.toUpperCase(),
                url: `${requestConfig.baseURL || ''}${requestConfig.url || ''}`,
                headers: {
                    'x-api-key': requestConfig.headers?.['x-api-key'] ? '***' + String(requestConfig.headers['x-api-key']).slice(-4) : 'none',
                    'Content-Type': requestConfig.headers?.['Content-Type'],
                },
                params: requestConfig.params,
                body: requestConfig.data ? JSON.stringify(requestConfig.data).slice(0, 500) : undefined,
            });
            return requestConfig;
        },
        (error) => {
            logger.error('API Request Error', error);
            return Promise.reject(error);
        },
    );

    // Response interceptor for logging + throttle detection
    client.interceptors.response.use(
        (response) => {
            // Successful response — notify throttle manager to reset backoff
            throttleManager.onSuccess();
            logger.debug('API Response', {
                status: response.status,
                url: response.config.url,
            });
            return response;
        },
        (error: AxiosError) => {
            const status = error.response?.status;
            const data = error.response?.data as Record<string, unknown> | undefined;

            // 429 — notify throttle manager (global, affects all loops)
            if (status === 429) {
                throttleManager.onThrottled();
            }

            logger.error('API Response Error', error, {
                status,
                url: error.config?.baseURL + '' + error.config?.url,
                data: typeof data === 'object' ? JSON.stringify(data) : data,
            });

            // Enhance error message with API error details
            if (data && typeof data === 'object' && data.message) {
                const apiMessage = Array.isArray(data.message)
                    ? (data.message as string[]).join(', ')
                    : String(data.message);
                error.message = `${error.message}: ${apiMessage}`;
            }

            return Promise.reject(error);
        },
    );

    return client;
}

/**
 * API client with automatic retry for transient failures
 */
export class ApiClient {
    private client: AxiosInstance;

    constructor(config: ApiClientConfig) {
        this.client = createApiClient(config);
    }

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return withRetry(
            async () => {
                const response = await this.client.get<T>(url, config);
                return response.data;
            },
            API_RETRY_DEFAULTS,
            logger,
            `GET ${url}`,
        );
    }

    async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
        return withRetry(
            async () => {
                const response = await this.client.post<T>(url, data, config);
                return response.data;
            },
            API_RETRY_DEFAULTS,
            logger,
            `POST ${url}`,
        );
    }

    /**
     * GET without retry (for operations where retry might cause issues)
     */
    async getOnce<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.get<T>(url, config);
        return response.data;
    }

    /**
     * POST without retry (for operations where retry might cause issues)
     */
    async postOnce<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.post<T>(url, data, config);
        return response.data;
    }
}

// Singleton API client
let apiClientInstance: ApiClient | null = null;

export function initApiClient(config: AppConfig): ApiClient {
    apiClientInstance = new ApiClient({
        baseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
    });
    return apiClientInstance;
}

export function getApiClient(): ApiClient {
    if (!apiClientInstance) {
        throw new Error('ApiClient not initialized. Call initApiClient first.');
    }
    return apiClientInstance;
}
