import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { fetchPoolState } from "../lib/pool";
export function usePool() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [poolState, setPoolState] = useState(null);
  const [solPrice, setSolPrice] = useState(null);
  const [solBalance, setSolBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txStatus, setTxStatus] = useState(null);

  const refreshPool = useCallback(async () => {
    try {
      const state = await fetchPoolState(connection);
      setPoolState(state);
    } catch (e) {
      console.error("fetchPoolState failed:", e);
    }
  }, [connection]);

  const refreshPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT"
      );
      const data = await res.json();
      setSolPrice(parseFloat(data.price));
    } catch (e) {
      console.error("price fetch failed:", e);
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!wallet.publicKey) return;
    try {
      const sol = await connection.getBalance(wallet.publicKey);
      setSolBalance(sol / LAMPORTS_PER_SOL);
      const usdcRes = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") }); const usdcAmount = usdcRes.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0; setUsdcBalance(usdcAmount);
    } catch (e) {
      console.error("balance fetch failed:", e);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    refreshPool();
    refreshPrice();
    const interval = setInterval(() => {
      refreshPool();
      refreshPrice();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshPool, refreshPrice]);

  useEffect(() => {
    if (wallet.connected) {
      refreshBalances();
      loadPositions();
    }
  }, [wallet.connected, refreshBalances]);

  const loadPositions = useCallback(async () => {
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const WHIRLPOOL_PROGRAM_ID = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
      const accounts = await connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );
      const nfts = accounts.value.filter(a => a.account.data.parsed.info.tokenAmount.amount === '1' && a.account.data.parsed.info.tokenAmount.decimals === 0);
      const mints = nfts.map(n => n.account.data.parsed.info.mint);
      const positions = [];
      for (const mint of mints) {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from('position'), new PublicKey(mint).toBuffer()],
          WHIRLPOOL_PROGRAM_ID
        );
        const info = await connection.getAccountInfo(pda);
        if (info && info.owner.toBase58() === WHIRLPOOL_PROGRAM_ID.toBase58()) {
          positions.push({ mint });
        }
      }
      setPositions(positions);
    } catch(e) {
      console.error('loadPositions failed:', e);
    }
  }, [wallet.publicKey, connection]);


  const openPosition = useCallback(async ({ priceLower, priceUpper, solAmount }) => {
    setLoading(true);
    setError(null);
    setTxStatus('building');
    try {
      const { Keypair, Transaction, PublicKey, LAMPORTS_PER_SOL: LAMPS } = await import('@solana/web3.js');
      const { priceToTick, getPositionPDA, SOL_USDC_WHIRLPOOL } = await import('../lib/pool');
      const { buildOpenPositionIx, buildIncreaseLiquidityIx, getATA, getTickArrayAddress, getStartTickIndex } = await import('../lib/instructions');
      const tickLower = -25260;
      const tickUpper = -24080;
      const positionMintKeypair = Keypair.generate();
      const positionMint = positionMintKeypair.publicKey;
      const positionPDA = getPositionPDA(positionMint);
      const positionTokenAccount = await getATA(positionMint, wallet.publicKey);
      const tokenOwnerA = await getATA(new PublicKey('So11111111111111111111111111111111111111112'), wallet.publicKey);
      const tokenOwnerB = await getATA(new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), wallet.publicKey);
      const tickArrayLower = getTickArrayAddress(SOL_USDC_WHIRLPOOL, getStartTickIndex(tickLower, poolState.tickSpacing));
      const tickArrayUpper = getTickArrayAddress(SOL_USDC_WHIRLPOOL, getStartTickIndex(tickUpper, poolState.tickSpacing));
      const lamports = Math.floor(solAmount * LAMPS);
      const usdcRaw = Math.floor(solAmount * poolState.currentPrice * 1e6);
      const decimalAdj = Math.pow(10, -3);
      const sqrtP = Math.sqrt(poolState.currentPrice * decimalAdj);
      const sqrtPl = Math.sqrt(Math.pow(1.0001, tickLower) * 1000 * decimalAdj);
      const sqrtPu = Math.sqrt(Math.pow(1.0001, tickUpper) * 1000 * decimalAdj);
      const liquidityAmount = Math.floor(lamports * sqrtP * sqrtPu / (sqrtPu - sqrtP));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey });
      
      tx.add(buildOpenPositionIx(wallet.publicKey, SOL_USDC_WHIRLPOOL, positionMint, positionPDA, positionTokenAccount, tickLower, tickUpper));
     
      setTxStatus('signing');
      const signed = await wallet.signTransaction(tx);
      signed.partialSign(positionMintKeypair);
      setTxStatus('sending');
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      setTxStatus('confirmed');
      setPositions(prev => [...prev, { mint: positionMint.toBase58(), sig }]);
      await refreshBalances();
// TX 2: wrap SOL + increaseLiquidity
      setTxStatus('building');
      const { blockhash: bh2, lastValidBlockHeight: lv2 } = await connection.getLatestBlockhash();
      const tx2 = new Transaction({ recentBlockhash: bh2, feePayer: wallet.publicKey });
      const { SystemProgram: SP3 } = await import('@solana/web3.js');
      const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
      const ASSOC = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
      // Create wSOL ATA
      tx2.add({ programId: ASSOC, keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: WSOL, isSigner: false, isWritable: false },
        { pubkey: SP3.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROG, isSigner: false, isWritable: false },
      ], data: Buffer.from([]) });
      // Transfer SOL to wSOL ATA
      tx2.add(SP3.transfer({ fromPubkey: wallet.publicKey, toPubkey: tokenOwnerA, lamports: Math.floor(lamports * 1.02) }));
      // SyncNative
      tx2.add(new (await import('@solana/web3.js')).TransactionInstruction({ programId: TOKEN_PROG, keys: [{ pubkey: tokenOwnerA, isSigner: false, isWritable: true }], data: Buffer.from([17]) }));
      // increaseLiquidity
      tx2.add(buildIncreaseLiquidityIx(wallet.publicKey, positionPDA, positionTokenAccount, SOL_USDC_WHIRLPOOL, tokenOwnerA, tokenOwnerB, new PublicKey("EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9"), new PublicKey("2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP"), tickArrayLower, tickArrayUpper, liquidityAmount, Math.floor(lamports * 1.1), Math.floor(usdcRaw * 1.1)));
      // Close wSOL ATA (unwrap)
      tx2.add(new (await import('@solana/web3.js')).TransactionInstruction({ programId: TOKEN_PROG, keys: [{ pubkey: tokenOwnerA, isSigner: false, isWritable: true }, { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, { pubkey: wallet.publicKey, isSigner: true, isWritable: false }], data: Buffer.from([9]) }));
      setTxStatus('signing');
      const signed2 = await wallet.signTransaction(tx2);
      setTxStatus('sending');
      const sig2 = await connection.sendRawTransaction(signed2.serialize(), { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig2, blockhash: bh2, lastValidBlockHeight: lv2 }, 'confirmed');
      setTxStatus('confirmed');
      await refreshBalances();
    } catch (e) { if (e.logs) console.log("TX2 logs:", JSON.stringify(e.logs));
      setError(e.message);
      setTxStatus(null);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, poolState, refreshBalances]);


  const fetchPosition = useCallback(async (mintAddress) => {
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getPositionPDA, tickToPrice } = await import('../lib/pool');
      const mint = new PublicKey(mintAddress);
      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('position'), mint.toBuffer()],
        new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc')
      );
      const info = await connection.getAccountInfo(positionPDA);
      const data = info.data;
      const liquidity = data.readBigUInt64LE(72).toString();
      const tickLower = data.readInt32LE(88);
      const tickUpper = data.readInt32LE(92);
      const feeOwedA = data.readBigUInt64LE(112).toString();
      const feeOwedB = data.readBigUInt64LE(136).toString();
      const priceLower = Math.pow(1.0001, tickLower) * 1000;
      const priceUpper = Math.pow(1.0001, tickUpper) * 1000;

  const decAdj=1e-3;
      const curPrice=poolState?.currentPrice||85;
      const clampedP=Math.min(Math.max(curPrice,priceLower),priceUpper);
      const sqrtP=Math.sqrt(clampedP*decAdj);
      const sqrtPl=Math.sqrt(priceLower*decAdj);
      const sqrtPu=Math.sqrt(priceUpper*decAdj);
      const liq=Number(liquidity);
      const solAmount=liq*(1/sqrtP - 1/sqrtPu)/1e9;
      const usdcAmount=liq*(sqrtP-sqrtPl)/1e6;
      return { liquidity, tickLower, tickUpper, priceLower, priceUpper, feeOwedA, feeOwedB, solAmount, usdcAmount };
    } catch(e) {
      console.error('fetchPosition failed:', e);
      return null;
    }
  }, [connection]);




  const collectFees = useCallback(async (mintAddress) => {
    if (!wallet?.publicKey || !connection) return;
    try {
      setLoading(true);
      const { PublicKey, Transaction, TransactionInstruction, SystemProgram } = await import('@solana/web3.js');
      const { getATA } = await import('../lib/instructions');
      const W = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
      const T = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
      const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const mint = new PublicKey(mintAddress);
      const [positionPDA] = PublicKey.findProgramAddressSync([Buffer.from('position'), mint.toBuffer()], W);
      const positionTokenAccount = await getATA(mint, wallet.publicKey);
      const tokenOwnerA = await getATA(WSOL, wallet.publicKey);
      const tokenOwnerB = await getATA(USDC, wallet.publicKey);
      const disc = Buffer.from([207,117,95,191,229,180,226,15,0]);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey });
      // Create wSOL ATA if needed
      const wsolInfo = await connection.getAccountInfo(tokenOwnerA);
      if (!wsolInfo) {
        tx.add({ programId: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'), keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
          { pubkey: WSOL, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: T, isSigner: false, isWritable: false },
        ], data: Buffer.from([]) });
      }
      tx.add(new TransactionInstruction({ programId: W, keys: [
        { pubkey: new PublicKey('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'), isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: positionPDA, isSigner: false, isWritable: true },
        { pubkey: positionTokenAccount, isSigner: false, isWritable: false },
        { pubkey: WSOL, isSigner: false, isWritable: false },
        { pubkey: USDC, isSigner: false, isWritable: false },
        { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9'), isSigner: false, isWritable: true },
        { pubkey: tokenOwnerB, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP'), isSigner: false, isWritable: true },
        { pubkey: T, isSigner: false, isWritable: false },
        { pubkey: T, isSigner: false, isWritable: false },
        { pubkey: MEMO, isSigner: false, isWritable: false },
      ], data: disc }));
      // Unwrap wSOL
      tx.add(new TransactionInstruction({ programId: T, keys: [
        { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      ], data: Buffer.from([9]) }));
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      await refreshBalances();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, refreshBalances]);
  const decreaseLiquidity = useCallback(async (mintAddress, liquidityAmount) => {
    if (!wallet?.publicKey || !connection) return;
    try {
      setLoading(true);
      const { PublicKey, Transaction, TransactionInstruction, SystemProgram } = await import('@solana/web3.js');
      const { getATA, getTickArrayAddress, getStartTickIndex } = await import('../lib/instructions');
      const W = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
      const T = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
      const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const mint = new PublicKey(mintAddress);
      const [positionPDA] = PublicKey.findProgramAddressSync([Buffer.from('position'), mint.toBuffer()], W);
      const positionTokenAccount = await getATA(mint, wallet.publicKey);
      const tokenOwnerA = await getATA(WSOL, wallet.publicKey);
      const tokenOwnerB = await getATA(USDC, wallet.publicKey);
      // Read position to get ticks
      const posInfo = await connection.getAccountInfo(positionPDA);
      const tickLower = posInfo.data.readInt32LE(88);
      const tickUpper = posInfo.data.readInt32LE(92);
      const tickSpacing = poolState.tickSpacing;
      const tickArrayLower = getTickArrayAddress(new PublicKey('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'), getStartTickIndex(tickLower, tickSpacing));
      const tickArrayUpper = getTickArrayAddress(new PublicKey('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'), getStartTickIndex(tickUpper, tickSpacing));
      const disc = Buffer.from([58,127,188,62,79,82,196,96]);
      const data = Buffer.alloc(41);
      disc.copy(data, 0);
      data.writeBigUInt64LE(BigInt(liquidityAmount) & 0xFFFFFFFFFFFFFFFFn, 8);
      data.writeBigUInt64LE(BigInt(0), 16);
      data.writeBigUInt64LE(BigInt(0), 24);
      data.writeBigUInt64LE(BigInt(0), 32);
      data.writeUInt8(0, 40);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey });
      // Create wSOL ATA if needed
      const wsolInfo = await connection.getAccountInfo(tokenOwnerA);
      if (!wsolInfo) {
        tx.add({ programId: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'), keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
          { pubkey: WSOL, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: T, isSigner: false, isWritable: false },
        ], data: Buffer.from([]) });
      }
      tx.add(new TransactionInstruction({ programId: W, keys: [
        { pubkey: new PublicKey('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'), isSigner: false, isWritable: true },
        { pubkey: T, isSigner: false, isWritable: false },
        { pubkey: T, isSigner: false, isWritable: false },
        { pubkey: MEMO, isSigner: false, isWritable: false },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: positionPDA, isSigner: false, isWritable: true },
        { pubkey: positionTokenAccount, isSigner: false, isWritable: false },
        { pubkey: WSOL, isSigner: false, isWritable: false },
        { pubkey: USDC, isSigner: false, isWritable: false },
        { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
        { pubkey: tokenOwnerB, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9'), isSigner: false, isWritable: true },
        { pubkey: new PublicKey('2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP'), isSigner: false, isWritable: true },
        { pubkey: tickArrayLower, isSigner: false, isWritable: true },
        { pubkey: tickArrayUpper, isSigner: false, isWritable: true },
      ], data }));
      // Close wSOL ATA to unwrap
      tx.add(new TransactionInstruction({ programId: T, keys: [
        { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      ], data: Buffer.from([9]) }));
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      await refreshBalances();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, poolState, refreshBalances]);

  const addLiquidity = useCallback(async (mintAddress, solAmount) => {
    if (!wallet?.publicKey || !connection) return;
    try {
      setLoading(true);
      const { PublicKey, Transaction, TransactionInstruction, SystemProgram } = await import('@solana/web3.js');
      const { getATA, buildIncreaseLiquidityIx, getTickArrayAddress, getStartTickIndex } = await import('../lib/instructions');
      const { SOL_USDC_WHIRLPOOL } = await import('../lib/pool');
      const W = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
      const T = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
      const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const mint = new PublicKey(mintAddress);
      const [positionPDA] = PublicKey.findProgramAddressSync([Buffer.from('position'), mint.toBuffer()], W);
      const positionTokenAccount = await getATA(mint, wallet.publicKey);
      const tokenOwnerA = await getATA(WSOL, wallet.publicKey);
      const tokenOwnerB = await getATA(USDC, wallet.publicKey);
      // Read position ticks
      const posInfo = await connection.getAccountInfo(positionPDA);
      const tickLower = posInfo.data.readInt32LE(88);
      const tickUpper = posInfo.data.readInt32LE(92);
      const tickArrayLower = getTickArrayAddress(SOL_USDC_WHIRLPOOL, getStartTickIndex(tickLower, poolState.tickSpacing));
      const tickArrayUpper = getTickArrayAddress(SOL_USDC_WHIRLPOOL, getStartTickIndex(tickUpper, poolState.tickSpacing));
      // Calculate liquidity
      const lamports = Math.floor(solAmount * 1e9);
      const decimalAdj = Math.pow(10, -3);
      const sqrtP = Math.sqrt(poolState.currentPrice * decimalAdj);
      const sqrtPl = Math.sqrt(Math.pow(1.0001, tickLower) * 1000 * decimalAdj);
      const sqrtPu = Math.sqrt(Math.pow(1.0001, tickUpper) * 1000 * decimalAdj);
      const liquidityAmount = Math.floor(lamports * sqrtP * sqrtPu / (sqrtPu - sqrtP));
      const usdcRaw = Math.floor(liquidityAmount * (sqrtP - sqrtPl) * 1e6);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey });
      const { SystemProgram: SP } = await import('@solana/web3.js');
      const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const ASSOC = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
      tx.add({ programId: ASSOC, keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: WSOL, isSigner: false, isWritable: false },
        { pubkey: SP.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROG, isSigner: false, isWritable: false },
      ], data: Buffer.from([]) });
      tx.add(SP.transfer({ fromPubkey: wallet.publicKey, toPubkey: tokenOwnerA, lamports: Math.floor(lamports * 1.1) }));
      tx.add(new TransactionInstruction({ programId: TOKEN_PROG, keys: [{ pubkey: tokenOwnerA, isSigner: false, isWritable: true }], data: Buffer.from([17]) }));
      tx.add(buildIncreaseLiquidityIx(wallet.publicKey, positionPDA, positionTokenAccount, SOL_USDC_WHIRLPOOL, tokenOwnerA, tokenOwnerB, new PublicKey('EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9'), new PublicKey('2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP'), tickArrayLower, tickArrayUpper, liquidityAmount, Math.floor(lamports * 1.1), Math.floor(usdcRaw * 1.1)));
      tx.add(new TransactionInstruction({ programId: TOKEN_PROG, keys: [{ pubkey: tokenOwnerA, isSigner: false, isWritable: true }, { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, { pubkey: wallet.publicKey, isSigner: true, isWritable: false }], data: Buffer.from([9]) }));
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      setTxStatus('confirmed');
      await refreshBalances();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, poolState, refreshBalances]);
  const closePosition = useCallback(async (mintAddress) => {
    try {
      setLoading(true);
      const { PublicKey, Transaction, TransactionInstruction } = await import('@solana/web3.js');
      const { getATA } = await import('../lib/instructions');
      const W = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
      const T = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const mint = new PublicKey(mintAddress);
      const [positionPDA] = PublicKey.findProgramAddressSync([Buffer.from('position'), mint.toBuffer()], W);
      const positionTokenAccount = await getATA(mint, wallet.publicKey);
      const disc = Buffer.from([123,134,81,0,49,68,98,98]);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey });
      tx.add(new TransactionInstruction({
        programId: W,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: positionPDA, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: positionTokenAccount, isSigner: false, isWritable: true },
          { pubkey: T, isSigner: false, isWritable: false },
        ],
        data: disc,
      }));
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      setPositions(prev => prev.filter(p => p.mint !== mintAddress));
      await refreshBalances();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, refreshBalances]);
  return {
    poolState,
    solPrice,
    solBalance,
    usdcBalance,
    positions,
    loading,
    error,
    txStatus,
    setPositions,
    setLoading,
    setError,
    setTxStatus,
    refreshPool,
    refreshBalances,
    openPosition,
    fetchPosition,
    addLiquidity,
    collectFees,
    decreaseLiquidity,
    closePosition,
  };
}