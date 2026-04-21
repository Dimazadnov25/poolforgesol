export default function PositionCard({ position, onCollect, loading }) {
  const short = (s) => s.slice(0, 6) + "..." + s.slice(-4);
  return (
    <div className="position-card">
      <div className="pos-header">
        <span className="pos-mint">{short(position.mint)}</span>
        {position.sig && (
          <a href={"https://solscan.io/tx/" + position.sig} target="_blank" rel="noreferrer" className="tx-link">
            View tx
          </a>
        )}
      </div>
      <div className="pos-actions">
        <button className="btn-secondary" onClick={onCollect} disabled={loading}>
          {loading ? "..." : "Collect Fees"}
        </button>
      </div>
    </div>
  );
}
