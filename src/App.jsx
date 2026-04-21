import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import PoolDashboard from "./components/PoolDashboard";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || clusterApiUrl(network),
    [network]
  );
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <PoolDashboard />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}