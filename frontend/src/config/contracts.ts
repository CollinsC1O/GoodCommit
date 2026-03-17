// Contract addresses for different networks
export const CONTRACTS = {
  // Celo Mainnet
  42220: {
    gToken: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
    staking: '0x0C6A7E2D57ac78F63a1A8a7fC2CeE4840CD451BD',
  },
  // Alfajores Testnet
  44787: {
    gToken: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
    staking: '0x0C6A7E2D57ac78F63a1A8a7fC2CeE4840CD451BD', // Reusing the same deployment logic for now
  },
} as const;

export type ChainId = keyof typeof CONTRACTS;

export function getContracts(chainId: number) {
  return CONTRACTS[chainId as ChainId] || CONTRACTS[44787]; // Default to testnet
}
