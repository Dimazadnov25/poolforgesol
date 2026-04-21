const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } = require('@orca-so/whirlpools');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=e129ef66-4dde-4f0d-bc1b-e4197604806d';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { positionMint, wallet, solAmount } = req.body;
    const connection = new Connection(RPC);
    const ctx = WhirlpoolContext.from(connection, { publicKey: new PublicKey(wallet) }, ORCA_WHIRLPOOL_PROGRAM_ID);
    const client = buildWhirlpoolClient(ctx);
    
    const position = await client.getPosition(new PublicKey(positionMint));
    const whirlpool = await client.getPool(position.getData().whirlpool);
    
    const quote = await position.increaseLiquidityQuoteByInputTokenWithParams({
      inputTokenMint: new PublicKey('So11111111111111111111111111111111111111112'),
      inputTokenAmount: BigInt(Math.floor(solAmount * 1e9)),
      slippageTolerance: { numerator: 1n, denominator: 100n },
    });
    
    const tx = await position.increaseLiquidity(quote);
    const built = await tx.build();
    
    res.json({ transaction: Buffer.from(built.transaction.serialize({ requireAllSignatures: false })).toString('base64') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
