import { PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";

const WHIRLPOOL_PROGRAM_ID = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const ASSOCIATED_TOKEN_PROGRAM_ID_REAL = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const RENT_PROGRAM_ID = new PublicKey("SysvarRent111111111111111111111111111111111");

export async function getATA(mint, owner) {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID_REAL
  );
  return ata;
}

export function buildOpenPositionIx(wallet, whirlpool, positionMint, positionPDA, positionTokenAccount, tickLower, tickUpper) {
  const data = Buffer.alloc(17);
  Buffer.from([135, 128, 47, 77, 15, 152, 240, 49]).copy(data, 0);
  data.writeUInt8(255, 8);
  data.writeInt32LE(tickLower, 9);
  data.writeInt32LE(tickUpper, 13);

  return new TransactionInstruction({
    programId: WHIRLPOOL_PROGRAM_ID,
    keys: [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: positionPDA, isSigner: false, isWritable: true },
      { pubkey: positionMint, isSigner: true, isWritable: true },
      { pubkey: positionTokenAccount, isSigner: false, isWritable: true },
      { pubkey: whirlpool, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildIncreaseLiquidityIx(wallet, positionPDA, positionTokenAccount, whirlpool, tokenOwnerA, tokenOwnerB, tokenVaultA, tokenVaultB, tickArrayLower, tickArrayUpper, liquidityAmount, tokenMaxA, tokenMaxB) {
  const data = Buffer.alloc(41);
  Buffer.from([133, 29, 89, 223, 69, 238, 176, 10]).copy(data, 0);
  data.writeBigUInt64LE(BigInt(liquidityAmount) & 0xFFFFFFFFFFFFFFFFn, 8);
  data.writeBigUInt64LE(BigInt(0), 16);
  data.writeBigUInt64LE(BigInt(tokenMaxA), 24);
  data.writeBigUInt64LE(BigInt(tokenMaxB), 32);
  data.writeUInt8(0, 40);
  const TP = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const MP = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  const SM = new PublicKey('So11111111111111111111111111111111111111112');
  const UM = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  return new TransactionInstruction({
    programId: WHIRLPOOL_PROGRAM_ID,
    keys: [
      { pubkey: whirlpool, isSigner: false, isWritable: true },
      { pubkey: TP, isSigner: false, isWritable: false },
      { pubkey: TP, isSigner: false, isWritable: false },
      { pubkey: MP, isSigner: false, isWritable: false },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: positionPDA, isSigner: false, isWritable: true },
      { pubkey: positionTokenAccount, isSigner: false, isWritable: false },
      { pubkey: SM, isSigner: false, isWritable: false },
      { pubkey: UM, isSigner: false, isWritable: false },
      { pubkey: tokenOwnerA, isSigner: false, isWritable: true },
      { pubkey: tokenOwnerB, isSigner: false, isWritable: true },
      { pubkey: tokenVaultA, isSigner: false, isWritable: true },
      { pubkey: tokenVaultB, isSigner: false, isWritable: true },
      { pubkey: tickArrayLower, isSigner: false, isWritable: true },
      { pubkey: tickArrayUpper, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function getTickArrayAddress(whirlpool, startTick) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('tick_array'), whirlpool.toBuffer(), Buffer.from(startTick.toString())],
    WHIRLPOOL_PROGRAM_ID
  );
  return pda;
}

export function getStartTickIndex(tick, tickSpacing) {
  const ticksInArray = tickSpacing * 88;
  return Math.floor(tick / ticksInArray) * ticksInArray;
}
