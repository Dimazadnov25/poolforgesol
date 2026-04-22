const {Connection,Keypair,PublicKey,Transaction,TransactionInstruction,SystemProgram}=require('/workspaces/codespaces-react/poolforge/node_modules/@solana/web3.js');
const bs58=require('/workspaces/codespaces-react/poolforge/node_modules/bs58');

const PRIVATE_KEY='yDboB5SPr5XwrsxEoadA5jceocNzCXmGiughnB6cwNWXZoEfUqHopWaqRxBi3LkymjeHgVZe862N1DqRmSeMnQP';
const RPC='https://mainnet.helius-rpc.com/?api-key=e129ef66-4dde-4f0d-bc1b-e4197604806d';
const WHIRLPOOL=new PublicKey('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
const W=new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
const T=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const WSOL=new PublicKey('So11111111111111111111111111111111111111112');
const USDC=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MEMO=new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const THRESHOLD_PCT=0.01;
const CHECK_INTERVAL_MS=60000;
const RANGE_WIDTH_PCT=0.05; // 5% range when rebalancing

const decode=bs58.decode||bs58.default?.decode;
const keypair=Keypair.fromSecretKey(decode(PRIVATE_KEY));
const connection=new Connection(RPC);
console.log('Wallet:',keypair.publicKey.toBase58());

function getATA(mint,owner){
  const[ata]=PublicKey.findProgramAddressSync([owner.toBuffer(),T.toBuffer(),mint.toBuffer()],ASSOC);
  return ata;
}
function getTickArrayAddr(startTick){
  const[pda]=PublicKey.findProgramAddressSync([Buffer.from('tick_array'),WHIRLPOOL.toBuffer(),Buffer.from(startTick.toString())],W);
  return pda;
}
function priceToTick(price){
  return Math.round(Math.log(price/1000)/Math.log(1.0001)/4)*4;
}
function getStartTick(tick){
  return Math.floor(tick/(4*88))*4*88;
}

async function getPosition(){
  const nfts=(await connection.getParsedTokenAccountsByOwner(keypair.publicKey,{programId:T})).value.filter(a=>a.account.data.parsed.info.tokenAmount.amount==='1');
  for(const n of nfts){
    const mint=new PublicKey(n.account.data.parsed.info.mint);
    const[pda]=PublicKey.findProgramAddressSync([Buffer.from('position'),mint.toBuffer()],W);
    const info=await connection.getAccountInfo(pda);
    if(!info) continue;
    const liq=info.data.readBigUInt64LE(72);
    if(liq>0n) return {mint,pda,
      tickLower:info.data.readInt32LE(88),
      tickUpper:info.data.readInt32LE(92),
      liquidity:liq};
  }
  return null;
}

async function closePos(mint,pda){
  const posTokenAcc=getATA(mint,keypair.publicKey);
  const disc=Buffer.from([123,134,81,0,49,68,98,98]);
  const{blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash();
  const tx=new Transaction({recentBlockhash:blockhash,feePayer:keypair.publicKey});
  tx.add(new TransactionInstruction({programId:W,keys:[
    {pubkey:keypair.publicKey,isSigner:true,isWritable:true},
    {pubkey:keypair.publicKey,isSigner:true,isWritable:true},
    {pubkey:pda,isSigner:false,isWritable:true},
    {pubkey:mint,isSigner:false,isWritable:true},
    {pubkey:posTokenAcc,isSigner:false,isWritable:true},
    {pubkey:T,isSigner:false,isWritable:false},
  ],data:disc}));
  tx.sign(keypair);
  const sig=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  await connection.confirmTransaction({signature:sig,blockhash,lastValidBlockHeight},'confirmed');
  console.log('Position closed:',sig);
}

async function decreaseAllLiquidity(mint,pda,tickLower,tickUpper,liquidity){
  const posTokenAcc=getATA(mint,keypair.publicKey);
  const tokOwnerA=getATA(WSOL,keypair.publicKey);
  const tokOwnerB=getATA(USDC,keypair.publicKey);
  const tl=getTickArrayAddr(getStartTick(tickLower));
  const tu=getTickArrayAddr(getStartTick(tickUpper));
  const disc=Buffer.from([58,127,188,62,79,82,196,96]);
  const data=Buffer.alloc(41);
  disc.copy(data,0);
  data.writeBigUInt64LE(BigInt(liquidity)&0xFFFFFFFFFFFFFFFFn,8);
  data.writeBigUInt64LE(0n,16);
  data.writeBigUInt64LE(0n,24);
  data.writeBigUInt64LE(0n,32);
  data.writeUInt8(0,40);
  const{blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash();
  const tx=new Transaction({recentBlockhash:blockhash,feePayer:keypair.publicKey});
  const wsolInfo=await connection.getAccountInfo(tokOwnerA);
  if(!wsolInfo){
    tx.add({programId:ASSOC,keys:[
      {pubkey:keypair.publicKey,isSigner:true,isWritable:true},
      {pubkey:tokOwnerA,isSigner:false,isWritable:true},
      {pubkey:keypair.publicKey,isSigner:false,isWritable:false},
      {pubkey:WSOL,isSigner:false,isWritable:false},
      {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
      {pubkey:T,isSigner:false,isWritable:false},
    ],data:Buffer.from([])});
  }
  tx.add(new TransactionInstruction({programId:W,keys:[
    {pubkey:WHIRLPOOL,isSigner:false,isWritable:true},
    {pubkey:T,isSigner:false,isWritable:false},
    {pubkey:T,isSigner:false,isWritable:false},
    {pubkey:MEMO,isSigner:false,isWritable:false},
    {pubkey:keypair.publicKey,isSigner:true,isWritable:false},
    {pubkey:pda,isSigner:false,isWritable:true},
    {pubkey:posTokenAcc,isSigner:false,isWritable:false},
    {pubkey:WSOL,isSigner:false,isWritable:false},
    {pubkey:USDC,isSigner:false,isWritable:false},
    {pubkey:tokOwnerA,isSigner:false,isWritable:true},
    {pubkey:tokOwnerB,isSigner:false,isWritable:true},
    {pubkey:new PublicKey('EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9'),isSigner:false,isWritable:true},
    {pubkey:new PublicKey('2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP'),isSigner:false,isWritable:true},
    {pubkey:tl,isSigner:false,isWritable:true},
    {pubkey:tu,isSigner:false,isWritable:true},
  ],data}));
  tx.add(new TransactionInstruction({programId:T,keys:[
    {pubkey:tokOwnerA,isSigner:false,isWritable:true},
    {pubkey:keypair.publicKey,isSigner:false,isWritable:true},
    {pubkey:keypair.publicKey,isSigner:true,isWritable:false},
  ],data:Buffer.from([9])}));
  tx.sign(keypair);
  const sig=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  await connection.confirmTransaction({signature:sig,blockhash,lastValidBlockHeight},'confirmed');
  console.log('Liquidity removed:',sig);
}

async function openNewPosition(price){
  const halfRange=price*RANGE_WIDTH_PCT/2;
  const priceLower=price-halfRange;
  const priceUpper=price+halfRange;
  const tickLower=priceToTick(priceLower);
  const tickUpper=priceToTick(priceUpper);
  console.log('New range: $'+priceLower.toFixed(2)+' - $'+priceUpper.toFixed(2));
  // Get SOL balance
  const solBal=await connection.getBalance(keypair.publicKey);
  const solAmount=(solBal-0.05e9)/1e9; // keep 0.05 SOL for fees
  if(solAmount<=0){console.log('Not enough SOL');return;}
  const lamports=Math.floor(solAmount*1e9);
  const{Keypair:KP}=require('/workspaces/codespaces-react/poolforge/node_modules/@solana/web3.js');
  const posMint=KP.generate();
  const[posPDA]=PublicKey.findProgramAddressSync([Buffer.from('position'),posMint.publicKey.toBuffer()],W);
  const posTokenAcc=getATA(posMint.publicKey,keypair.publicKey);
  const tokOwnerA=getATA(WSOL,keypair.publicKey);
  const tokOwnerB=getATA(USDC,keypair.publicKey);
  const tl=getTickArrayAddr(getStartTick(tickLower));
  const tu=getTickArrayAddr(getStartTick(tickUpper));
  // Open position
  const openDisc=Buffer.from([135,128,47,77,15,152,240,49]);
  const openData=Buffer.alloc(17);
  openDisc.copy(openData,0);
  openData.writeUInt8(255,8);
  openData.writeInt32LE(tickLower,9);
  openData.writeInt32LE(tickUpper,13);
  const{blockhash:bh1,lastValidBlockHeight:lv1}=await connection.getLatestBlockhash();
  const tx1=new Transaction({recentBlockhash:bh1,feePayer:keypair.publicKey});
  tx1.add(new TransactionInstruction({programId:W,keys:[
    {pubkey:keypair.publicKey,isSigner:true,isWritable:true},
    {pubkey:keypair.publicKey,isSigner:true,isWritable:false},
    {pubkey:posPDA,isSigner:false,isWritable:true},
    {pubkey:posMint.publicKey,isSigner:true,isWritable:true},
    {pubkey:posTokenAcc,isSigner:false,isWritable:true},
    {pubkey:WHIRLPOOL,isSigner:false,isWritable:false},
    {pubkey:T,isSigner:false,isWritable:false},
    {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
    {pubkey:new PublicKey('SysvarRent111111111111111111111111111111111'),isSigner:false,isWritable:false},
    {pubkey:ASSOC,isSigner:false,isWritable:false},
  ],data:openData}));
  tx1.sign(keypair,posMint);
  const sig1=await connection.sendRawTransaction(tx1.serialize(),{skipPreflight:true});
  await connection.confirmTransaction({signature:sig1,blockhash:bh1,lastValidBlockHeight:lv1},'confirmed');
  console.log('Position opened:',sig1);
  // Add liquidity
  const decAdj=1e-3;
  const sqrtP=Math.sqrt(price*decAdj);
  const sqrtPl=Math.sqrt(priceLower*decAdj);
  const sqrtPu=Math.sqrt(priceUpper*decAdj);
  const liqAmount=Math.floor(lamports*sqrtP*sqrtPu/(sqrtPu-sqrtP));
  const usdcRaw=Math.floor(liqAmount*(sqrtP-sqrtPl)*1e6);
  const incDisc=Buffer.from([133,29,89,223,69,238,176,10]);
  const incData=Buffer.alloc(41);
  incDisc.copy(incData,0);
  incData.writeBigUInt64LE(BigInt(liqAmount)&0xFFFFFFFFFFFFFFFFn,8);
  incData.writeBigUInt64LE(0n,16);
  incData.writeBigUInt64LE(BigInt(Math.floor(lamports*1.1)),24);
  incData.writeBigUInt64LE(BigInt(Math.floor(usdcRaw*1.1)),32);
  incData.writeUInt8(0,40);
  const{blockhash:bh2,lastValidBlockHeight:lv2}=await connection.getLatestBlockhash();
  const tx2=new Transaction({recentBlockhash:bh2,feePayer:keypair.publicKey});
  const wsolInfo=await connection.getAccountInfo(tokOwnerA);
  if(!wsolInfo){
    tx2.add({programId:ASSOC,keys:[
      {pubkey:keypair.publicKey,isSigner:true,isWritable:true},
      {pubkey:tokOwnerA,isSigner:false,isWritable:true},
      {pubkey:keypair.publicKey,isSigner:false,isWritable:false},
      {pubkey:WSOL,isSigner:false,isWritable:false},
      {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
      {pubkey:T,isSigner:false,isWritable:false},
    ],data:Buffer.from([])});
  }
  tx2.add(SystemProgram.transfer({fromPubkey:keypair.publicKey,toPubkey:tokOwnerA,lamports:Math.floor(lamports*1.1)}));
  tx2.add(new TransactionInstruction({programId:T,keys:[{pubkey:tokOwnerA,isSigner:false,isWritable:true}],data:Buffer.from([17])}));
  tx2.add(new TransactionInstruction({programId:W,keys:[
    {pubkey:WHIRLPOOL,isSigner:false,isWritable:true},
    {pubkey:T,isSigner:false,isWritable:false},
    {pubkey:T,isSigner:false,isWritable:false},
    {pubkey:MEMO,isSigner:false,isWritable:false},
    {pubkey:keypair.publicKey,isSigner:true,isWritable:false},
    {pubkey:posPDA,isSigner:false,isWritable:true},
    {pubkey:posTokenAcc,isSigner:false,isWritable:false},
    {pubkey:WSOL,isSigner:false,isWritable:false},
    {pubkey:USDC,isSigner:false,isWritable:false},
    {pubkey:tokOwnerA,isSigner:false,isWritable:true},
    {pubkey:tokOwnerB,isSigner:false,isWritable:true},
    {pubkey:new PublicKey('EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9'),isSigner:false,isWritable:true},
    {pubkey:new PublicKey('2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP'),isSigner:false,isWritable:true},
    {pubkey:tl,isSigner:false,isWritable:true},
    {pubkey:tu,isSigner:false,isWritable:true},
  ],data:incData}));
  tx2.add(new TransactionInstruction({programId:T,keys:[
    {pubkey:tokOwnerA,isSigner:false,isWritable:true},
    {pubkey:keypair.publicKey,isSigner:false,isWritable:true},
    {pubkey:keypair.publicKey,isSigner:true,isWritable:false},
  ],data:Buffer.from([9])}));
  tx2.sign(keypair);
  const sig2=await connection.sendRawTransaction(tx2.serialize(),{skipPreflight:true});
  await connection.confirmTransaction({signature:sig2,blockhash:bh2,lastValidBlockHeight:lv2},'confirmed');
  console.log('Liquidity added:',sig2);
}

async function checkAndRebalance(){
  try{
    const r=await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    const price=parseFloat((await r.json()).price);
    console.log('['+new Date().toLocaleTimeString()+'] SOL: $'+price.toFixed(2));
    const pos=await getPosition();
    if(!pos){console.log('No position found');return;}
    const priceLower=Math.pow(1.0001,pos.tickLower)*1000;
    const priceUpper=Math.pow(1.0001,pos.tickUpper)*1000;
    const lowerThreshold=priceLower*(1+THRESHOLD_PCT);
    const upperThreshold=priceUpper*(1-THRESHOLD_PCT);
    console.log('Range: $'+priceLower.toFixed(2)+' - $'+priceUpper.toFixed(2)+' | Thresholds: $'+lowerThreshold.toFixed(2)+' - $'+upperThreshold.toFixed(2));
    if(price<=lowerThreshold||price>=upperThreshold){
      console.log('⚠️  REBALANCING...');
      await decreaseAllLiquidity(pos.mint,pos.pda,pos.tickLower,pos.tickUpper,pos.liquidity);
      await closePos(pos.mint,pos.pda);
      await openNewPosition(price);
      console.log('✅ Rebalance complete!');
    }else{
      console.log('✅ In range, no action needed');
    }
  }catch(e){
    console.error('Error:',e.message);
  }
}

console.log('🚀 Auto-Rebalance started. Checking every minute...');
checkAndRebalance();
setInterval(checkAndRebalance,CHECK_INTERVAL_MS);
