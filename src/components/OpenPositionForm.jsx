import { useState } from "react";

export default function OpenPositionForm({ pool, solPrice, onOpen, loading }) {
  const currentPrice = pool?.currentPrice ?? solPrice ?? 150;

  const [priceLower, setPriceLower] = useState((currentPrice * 0.8).toFixed(2));
  const [priceUpper, setPriceUpper] = useState((currentPrice * 1.2).toFixed(2));
  const [solAmount, setSolAmount] = useState("0.1");

  const usdcEstimate = parseFloat(solAmount || 0) * currentPrice;

  function handleSubmit() {
    onOpen({
      priceLower: parseFloat(priceLower),
      priceUpper: parseFloat(priceUpper),
      solAmount: parseFloat(solAmount),
    });
  }

  const valid =
    parseFloat(priceLower) > 0 &&
    parseFloat(priceUpper) > parseFloat(priceLower) &&
    parseFloat(solAmount) > 0;

  return (
    <div className="form-card">
      <h2>Open Position</h2>
      <div className="current-price-row">
        Current price: <strong>{currentPrice.toFixed(4)} USDC/SOL</strong>
      </div>
      <div className="form-grid">
        <label>
          <span>Min price (USDC per SOL)</span>
          <input
            type="number"
            value={priceLower}
            min="0"
            step="1"
            onChange={(e) => setPriceLower(e.target.value)}
          />
        </label>
        <label>
          <span>Max price (USDC per SOL)</span>
          <input
            type="number"
            value={priceUpper}
            min="0"
            step="1"
            onChange={(e) => setPriceUpper(e.target.value)}
          />
        </label>
        <label className="full">
          <span>SOL amount</span>
          <input
            type="number"
            value={solAmount}
            min="0.001"
            step="0.01"
            onChange={(e) => setSolAmount(e.target.value)}
          />
        </label>
      </div>
      <div className="estimate-row">
        ≈ {usdcEstimate.toFixed(2)} USDC required
      </div>
      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={!valid || loading}
      >
        {loading ? "Processing…" : "Open Position"}
      </button>
    </div>
  );
}