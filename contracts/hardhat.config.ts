import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Testnet — use this first to verify everything works
    alfajores: {
      url: process.env.ALFAJORES_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11142220,
    },
    // Mainnet — deploy here when ready
    celo: {
      url: process.env.CELO_RPC_URL || "https://forno.celo.org",
      accounts: [process.env.PRIVATE_KEY!],
      chainId: 42220,
    },
  },
  etherscan: {
    apiKey: {
      // CeloScan API key for contract verification
      celo: process.env.CELOSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
    ],
  },
};

export default config;




// import { HardhatUserConfig } from "hardhat/config";
// import "@nomicfoundation/hardhat-toolbox";
// import * as dotenv from "dotenv";

// dotenv.config();

// const config: HardhatUserConfig = {
//   solidity: {
//     version: "0.8.20",
//     settings: {
//       optimizer: {
//         enabled: true,
//         runs: 200,
//       },
//     },
//   },
//   networks: {
//     alfajores: {
//       url: process.env.ALFAJORES_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
//       accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
//       chainId: 11142220,
//     },
//     celo: {
//       url: process.env.CELO_RPC_URL || "https://forno.celo.org",
//       accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
//       chainId: 42220,
//     },
//   },
//   etherscan: {
//     apiKey: {
//       alfajores: process.env.CELOSCAN_API_KEY || "",
//       celo: process.env.CELOSCAN_API_KEY || "",
//     },
//     customChains: [
//       {
//         network: "alfajores",
//         chainId: 11142220,
//         urls: {
//           apiURL: "https://celo-sepolia.blockscout.com/api",
//           browserURL: "https://celo-sepolia.blockscout.com",
//         },
//       },
//       {
//         network: "celo",
//         chainId: 42220,
//         urls: {
//           apiURL: "https://api.celoscan.io/api",
//           browserURL: "https://celoscan.io",
//         },
//       },
//     ],
//   },
//   paths: {
//     sources: "./contracts",
//     tests: "./test",
//     cache: "./cache",
//     artifacts: "./artifacts",
//   },
// };

// export default config;



