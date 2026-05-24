export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrl: import.meta.env.VITE_ARC_RPC_URL || "https://rpc.testnet.arc.network",
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: "https://testnet.arcscan.app"
    }
  }
};

export const contracts = {
  agoraMarket: import.meta.env.VITE_AGORA_MARKET_ADDRESS || "0x4135590D1733d6A5965350A3Ca6A8232e97C8D00",
  usdc: import.meta.env.VITE_USDC_ADDRESS || "0x3600000000000000000000000000000000000000"
};

export const agoraMarketAbi = [
  {
    type: "function",
    name: "publishSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentName", type: "string" },
      { name: "market", type: "string" },
      { name: "thesis", type: "string" },
      { name: "action", type: "string" },
      { name: "stakeAmount", type: "uint256" },
      { name: "targetPrice", type: "uint256" },
      { name: "confidence", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ],
    outputs: [{ name: "signalId", type: "uint256" }]
  },
  {
    type: "function",
    name: "nextSignalId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "resolveSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "signalId", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "evidenceURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "signals",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "agent", type: "address" },
      { name: "agentName", type: "string" },
      { name: "market", type: "string" },
      { name: "thesis", type: "string" },
      { name: "action", type: "string" },
      { name: "stakeAmount", type: "uint256" },
      { name: "targetPrice", type: "uint256" },
      { name: "confidence", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "evidenceURI", type: "string" }
    ]
  },
  {
    type: "function",
    name: "agentStats",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "signals", type: "uint256" },
      { name: "wins", type: "uint256" },
      { name: "losses", type: "uint256" },
      { name: "stakeVolume", type: "uint256" },
      { name: "rewards", type: "uint256" }
    ]
  }
];

export const usdcAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
];
