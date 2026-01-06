/**
 * Individual health check implementations
 */

import { ethers } from 'ethers';
import axios from 'axios';
import { AppConfig } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('health');

export interface HealthCheckResult {
    healthy: boolean;
    name: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface HealthCheck {
    name: string;
    check(): Promise<HealthCheckResult>;
}

/**
 * Check API connectivity
 */
export function createApiConnectivityCheck(config: AppConfig): HealthCheck {
    return {
        name: 'API Connectivity',
        async check(): Promise<HealthCheckResult> {
            try {
                const response = await axios.get(`${config.apiBaseUrl}/health`, {
                    timeout: 10000,
                });

                return {
                    healthy: true,
                    name: 'API Connectivity',
                    message: 'API is reachable',
                    details: { status: response.status },
                };
            } catch (error) {
                // Try a different endpoint if /health doesn't exist
                try {
                    await axios.get(`${config.apiBaseUrl}/octarine/requests`, {
                        timeout: 10000,
                        params: { limit: 1 },
                    });

                    return {
                        healthy: true,
                        name: 'API Connectivity',
                        message: 'API is reachable',
                    };
                } catch (innerError) {
                    return {
                        healthy: false,
                        name: 'API Connectivity',
                        message: `API unreachable: ${innerError instanceof Error ? innerError.message : String(innerError)}`,
                    };
                }
            }
        },
    };
}

/**
 * Check RPC connectivity and chain ID
 */
export function createRpcConnectivityCheck(config: AppConfig): HealthCheck {
    return {
        name: 'RPC Connectivity',
        async check(): Promise<HealthCheckResult> {
            try {
                const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
                const network = await provider.getNetwork();

                const expectedChain = config.supportedChains[0];
                if (network.chainId !== expectedChain) {
                    return {
                        healthy: false,
                        name: 'RPC Connectivity',
                        message: `Chain ID mismatch: expected ${expectedChain}, got ${network.chainId}`,
                        details: { expectedChainId: expectedChain, actualChainId: network.chainId },
                    };
                }

                return {
                    healthy: true,
                    name: 'RPC Connectivity',
                    message: 'RPC is reachable and chain ID matches',
                    details: { chainId: network.chainId, name: network.name },
                };
            } catch (error) {
                return {
                    healthy: false,
                    name: 'RPC Connectivity',
                    message: `RPC unreachable: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    };
}

/**
 * Check wallet balance
 */
export function createWalletBalanceCheck(config: AppConfig): HealthCheck {
    return {
        name: 'Wallet Balance',
        async check(): Promise<HealthCheckResult> {
            try {
                const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
                const balance = await provider.getBalance(config.marketMakerAddress);
                const minBalance = ethers.BigNumber.from(config.minEthBalanceWei);

                const balanceEth = ethers.utils.formatEther(balance);
                const minBalanceEth = ethers.utils.formatEther(minBalance);

                if (balance.lt(minBalance)) {
                    return {
                        healthy: false,
                        name: 'Wallet Balance',
                        message: `Low balance: ${balanceEth} ETH (minimum: ${minBalanceEth} ETH)`,
                        details: {
                            balance: balanceEth,
                            minimum: minBalanceEth,
                            address: config.marketMakerAddress,
                        },
                    };
                }

                return {
                    healthy: true,
                    name: 'Wallet Balance',
                    message: `Balance: ${balanceEth} ETH`,
                    details: {
                        balance: balanceEth,
                        address: config.marketMakerAddress,
                    },
                };
            } catch (error) {
                return {
                    healthy: false,
                    name: 'Wallet Balance',
                    message: `Failed to check balance: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    };
}

/**
 * Verify wallet can sign (private key is valid)
 */
export function createWalletSigningCheck(config: AppConfig): HealthCheck {
    return {
        name: 'Wallet Signing',
        async check(): Promise<HealthCheckResult> {
            try {
                const wallet = new ethers.Wallet(config.privateKey);

                if (wallet.address.toLowerCase() !== config.marketMakerAddress.toLowerCase()) {
                    return {
                        healthy: false,
                        name: 'Wallet Signing',
                        message: 'Private key does not match MARKET_MAKER_ADDRESS',
                        details: {
                            expected: config.marketMakerAddress,
                            derived: wallet.address,
                        },
                    };
                }

                // Test signing
                const testMessage = 'health-check';
                await wallet.signMessage(testMessage);

                return {
                    healthy: true,
                    name: 'Wallet Signing',
                    message: 'Wallet can sign transactions',
                    details: { address: wallet.address },
                };
            } catch (error) {
                return {
                    healthy: false,
                    name: 'Wallet Signing',
                    message: `Invalid private key: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    };
}
