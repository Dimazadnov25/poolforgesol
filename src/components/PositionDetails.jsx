import { useState, useEffect } from "react";

export default function PositionDetails({ position, poolState, fetchPosition, onClose, onDecrease, onCollect, onAddLiquidity, onUpdate, onRebalance }) {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (position?.mint) {
      fetchPosition(position.mint).then(d => { setDetails(d); if (onUpdate) onUpdate(position.mint, d); });
      const interval = setInterval(() => fetchPosition(position.mint).then(setDetails), 60000);
      return () => clearInterval(interval);
    }
  }, [position, fetchPosition]);

  if (!details) return <div className="position-card"><span className="pos-mint">Loading...</span></div>;

  const currentPrice = poolState?.currentPrice ?? 0;
  const inRange = currentPrice >= details.priceLower && currentPrice <= details.priceUpper;
  const feeA = (Number(details.feeOwedA) / 1e9).toFixed(6);
  const feeB = (Number(details.feeOwedB) / 1e6).toFixed(4);

  return (
    <div className="position-card" style={{ flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pos-mint">{position.mint.slice(0,6)}...{position.mint.slice(-4)}</span>
        <span style={{
          fontSize: "0.75rem",
          padding: "2px 10px",
          borderRadius: "20px",
          background: inRange ? "rgba(25,251,155,0.15)" : "rgba(255,77,77,0.15)",
          border: inRange ? "1px solid rgba(25,251,155,0.4)" : "1px solid rgba(255,77,77,0.4)",
          color: inRange ? "#19fb9b" : "#ff4d4d",
        }}>
          {inRange ? "IN RANGE" : "OUT OF RANGE"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
        <div style={{ color: "var(--muted)" }}>Min Price</div>
        <div>${details.priceLower.toFixed(2)}</div>
        <div style={{ color: "var(--muted)" }}>Max Price</div>
        <div>${details.priceUpper.toFixed(2)}</div>
        <div style={{ color: "var(--muted)" }}>Current Price</div>
        <div style={{ color: "#19fb9b" }}>${currentPrice.toFixed(2)}</div>
        <div style={{ color: "var(--muted)" }}>Earned SOL</div>
        <div>{feeA} SOL</div>
        <div style={{ color: "var(--muted)" }}>Earned USDC</div>
        <div>{feeB} USDC</div>
        <div style={{ color: 'var(--muted)' }}>Position Value</div>
        <div style={{ color: '#19fb9b' }}>${((details.solAmount||0)*currentPrice+(details.usdcAmount||0)).toFixed(2)} USD</div>
        <div style={{ color: 'var(--muted)' }}>SOL in Position</div>
        <div>{(details.solAmount||0).toFixed(4)} SOL</div>
        <div style={{ color: 'var(--muted)' }}>USDC in Position</div>
        <div>{(details.usdcAmount||0).toFixed(2)} USDC</div>
      </div>

      {position.sig && (
        <a href={"https://solscan.io/tx/" + position.sig} target="_blank" rel="noreferrer" className="tx-link">
          View tx
        </a>
      )}
      <button onClick={() => {
        const amt = prompt('SOL amount to add:');
        if (amt && onAddLiquidity) onAddLiquidity(position.mint, parseFloat(amt));
      }} style={{ marginTop: '0.5rem', marginRight: '0.5rem', padding: '0.4rem 1rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
        Add Liquidity
      </button>
      <button onClick={() => onRebalance && onRebalance(position.mint)} style={{ marginTop: '0.5rem', marginRight: '0.5rem', padding: '0.4rem 1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
        ⚡ Rebalance (3%)
      </button>
      <button onClick={() => onCollect && onCollect(position.mint)} style={{ marginTop: '0.5rem', marginRight: '0.5rem', padding: '0.4rem 1rem', background: '#19fb9b', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
        Collect Fees
      </button>
      <button onClick={async () => {
        if (details && Number(details.liquidity) > 0 && onDecrease) {
          await onDecrease(position.mint, details.liquidity);
        }
        if (onClose) onClose(position.mint);
      }} style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', background: '#ff4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
        Close Position
      </button>
    </div>
  );
}
