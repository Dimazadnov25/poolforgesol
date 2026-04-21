export default function PoolStats({ pool }) {
  return (
    <div className="stats-grid">
      <div className="stat-card">
        <span className="stat-label">Current Tick</span>
        <span className="stat-value">{pool.tickCurrent.toLocaleString()}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Price</span>
        <span className="stat-value">${pool.currentPrice.toFixed(4)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Tick Spacing</span>
        <span className="stat-value">{pool.tickSpacing}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Fee Rate</span>
        <span className="stat-value">{(pool.feeRate / 10000).toFixed(2)}%</span>
      </div>
    </div>
  );
}