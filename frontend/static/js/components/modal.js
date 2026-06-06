// Compatibility wrapper for legacy callers. Sprint 3 moves stock detail
// from a modal overlay to the full-page #detail/TICKER route.
export function openModal(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) return;
  window.location.hash = `#detail/${encodeURIComponent(symbol)}`;
}

export function closeModal() {
  window.location.hash = '#watchlist';
}

window.openModal = openModal;
window.closeModal = closeModal;
