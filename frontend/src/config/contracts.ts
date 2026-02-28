// Contract addresses for different networks
export const CONTRACTS = {
  // Celo Mainnet
  42220: {
    gToken: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
    staking: '0x0000000000000000000000000000000000000000', // Will Update after deployment
  },
  // Alfajores Testnet
  44787: {
    gToken: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
    staking: '0x0000000000000000000000000000000000000000', // Will Update after deployment
  },
} as const;

export type ChainId = keyof typeof CONTRACTS;

export function getContracts(chainId: number) {
  return CONTRACTS[chainId as ChainId] || CONTRACTS[44787]; // Default to testnet
}
