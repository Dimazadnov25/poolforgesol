import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";


export const WHIRLPOOL_PROGRAM_ID = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const SOL_USDC_WHIRLPOOL = new PublicKey("Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE");

export function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

export function priceToTick(price, tickSpacing = 4) {
  const rawTick = Math.log(price / 1000) / Math.log(1.0001);
  return Math.round(rawTick / tickSpacing) * tickSpacing;
}

export function getPositionPDA(positionMint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), positionMint.toBuffer()],
    WHIRLPOOL_PROGRAM_ID
  );
  return pda;
}

export function getTickArrayPDA(whirlpoolAddress, startTickIndex) {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(startTickIndex, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), whirlpoolAddress.toBuffer(), buf],
    WHIRLPOOL_PROGRAM_ID
  );
  return pda;
}

export async function fetchPoolState(connection) {
  const accountInfo = await connection.getAccountInfo(SOL_USDC_WHIRLPOOL);
  if (!accountInfo) throw new Error("Pool account not found");
  const data = accountInfo.data;
  const tickCurrent = data.readInt32LE(81);
  const tokenVaultA = new PublicKey(data.slice(133, 165));
  const tokenVaultB = new PublicKey(data.slice(213, 245));
  const tickSpacing = data.readUInt16LE(41);
  const feeRate = data.readUInt16LE(45);
  const currentPrice = tickToPrice(tickCurrent) * Math.pow(10, 9 - 6);
  return { tickCurrent, tokenVaultA, tokenVaultB, tickSpacing, feeRate, currentPrice };
 }