# Connection On-chain Project

This project contains the smart contracts and deployment scripts for an on-chain social connection platform. It features an ERC20 token (`ConnectionToken`) and a central registry contract (`ConnectionUserRegistry`) that manages user profiles, content interactions, and token distributions.

## Contracts

The core logic is split into two main contracts:

*   **`ConnectionToken (CT)`**: An ERC20 token that serves as the utility token within the ecosystem. It's used for paying fees, tipping, and receiving airdrop rewards.
*   **`ConnectionUserRegistry`**: The main contract that handles all major functionalities:
    *   User registration and profile modification.
    *   Fee collection for various actions (registration, content moderation).
    *   A tipping mechanism.
    *   An airdrop system with separate pools for users and content creators to incentivize participation.

## Getting Started

### Prerequisites

*   Node.js and npm
*   A `.env` file in the root directory to store environment variables.

### Installation

Clone the repository and install the dependencies:

```shell
git clone <repository-url>
cd connection-onchain
npm install
```

### Configuration

Create a `.env` file in the project root and add the following variables for deployment and contract verification:

```
# The address that will receive protocol fees.
FEE_RECEIVER=0x...

# Etherscan API key for the Base Sepolia testnet to enable contract verification.
BASE_SCAN_API_KEY=...
```

## Available Scripts

The `package.json` file includes several scripts to help with development and deployment:

*   `npm run compile`: Compiles the smart contracts.
*   `npm test`: Runs the test suite for the contracts.
*   `npm run deploy -- --network <network-name>`: Deploys the contracts to the specified network (e.g., `baseSepolia`, `localhost`).
*   `npm run build-contract`: A utility script that compiles contracts and copies the ABI of `ConnectionUserRegistry` to the `demo-web` frontend directory.

## Demo Web Application (`demo-web`)

The project includes a `demo-web` directory which contains a frontend application for interacting with the smart contracts.

When you run the `deploy` script, it automatically performs the following actions for the frontend:

1.  **Updates Configuration**: The script updates `demo-web/src/config/contracts.json` with the newly deployed contract addresses for the specified network.
2.  **Copies ABI**: It copies the ABI of the `ConnectionUserRegistry` contract to `demo-web/src/config/abi/`, ensuring the frontend can communicate with the contract.

This setup streamlines the process of connecting the frontend with the deployed backend after each deployment.
