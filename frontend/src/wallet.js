import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain, http } from "viem";
import { arcTestnet } from "./contracts";

export const arcChain = defineChain({
  id: arcTestnet.id,
  name: arcTestnet.name,
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: {
    default: {
      http: [arcTestnet.rpcUrl]
    }
  },
  blockExplorers: arcTestnet.blockExplorers,
  testnet: true
});

export const wagmiConfig = getDefaultConfig({
  appName: "Agora Agent Market",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "agora-agent-market",
  chains: [arcChain],
  transports: {
    [arcChain.id]: http(arcTestnet.rpcUrl)
  },
  ssr: false
});

