# Octarine Examples & Projects

This repository contains example implementations and full projects for interacting with the **Octarine** protocol (Mystic Finance).

## Directory Structure

- **`market-maker/`**: A production-ready Market Maker bot for handling Instant Redemption Bids and Liquidation Triggers.
- **`user/`**: A React-based web application for users to Request Quotes and Swap Tokens.

---

## Market Maker Bot (`/market-maker`)

A production-ready bot for market makers to participate in the Octarine ecosystem. Version 2.0 includes significant reliability improvements.

### Features

- **Instant Redemption Bidding**: Automatically polls/subscribes for RFQ requests and submits bids based on configurable spread.
- **Liquidation Triggers**: Monitors for underwater positions and triggers liquidations to earn bonuses.
- **Multi-Chain Support**: Configure multiple supported chains with proper filtering.
- **Slack Notifications**: Get notified on bid wins, liquidations, and errors.
- **WebSocket Support**: Real-time event streaming alongside polling for redundancy.
- **Health Checks**: Validates API, RPC, and wallet configuration before starting.
- **Retry Logic**: Automatic retries with exponential backoff for transient failures.
- **Structured Logging**: Configurable log levels (debug, info, warn, error).

### Quick Start

1. Navigate to the directory:
    ```bash
    cd market-maker
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Configure environment:
    ```bash
    cp .env.example .env
    # Edit .env with your settings
    ```

    Required settings:
    - `PRIVATE_KEY` - Your wallet private key
    - `MARKET_MAKER_ADDRESS` - Your wallet address

4. Run the bot:
    ```bash
    npm start        # Production (compiled)
    npm run dev      # Development (ts-node)
    ```

### Configuration

See `.env.example` for all available options. Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPPORTED_CHAINS` | Comma-separated chain IDs | `98866` |
| `PRICE_SPREAD` | RFQ bid spread (0.98 = 2% fee) | `0.98` |
| `LIQUIDATION_SPREAD` | Liquidation spread | `0.99` |
| `SLACK_ENABLED` | Enable Slack notifications | `false` |
| `WS_ENABLED` | Enable WebSocket events | `false` |
| `LOG_LEVEL` | debug, info, warn, error | `info` |

### Architecture

```
market-maker/src/
├── index.ts              # Entry point with health checks
├── config/               # Configuration loading & validation
├── types/                # TypeScript type definitions
├── services/
│   ├── api/              # API client, RFQ, liquidation, WebSocket
│   ├── notifications/    # Slack notification service
│   └── wallet/           # Wallet manager with mutex for nonce safety
├── utils/                # Logger, retry, signing utilities
├── loops/                # Bidding and liquidation loops
└── health/               # Startup health checks
```

---

## User Application (`/user`)

A simple frontend for end-users to perform redemptions/swaps.

### Features

- **Wallet Connection**: Supports MetaMask and other Injected Wallets.
- **Swap Interface**: Simple UI to input Token In, Token Out, and Amount.
- **Smart Routing**: Automatically handles "Instant" (Pre-Approved) swaps vs. "RFQ" (Bidding) flows.

### Quick Start

1. Navigate to the directory:
    ```bash
    cd user
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Start Development Server:
    ```bash
    npm run dev
    ```

4. Open `http://localhost:3000` (or the URL shown in terminal).

---

## Configuration

Make sure to construct your `.env` files correctly in each project directory.

**Note**: The root `.gitignore` is set up to exclude `.env` files and `node_modules` to prevent accidental commits of sensitive data.
