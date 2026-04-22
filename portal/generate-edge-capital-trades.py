#!/usr/bin/env python3
"""Generate portal/shared/edge-capital-trades.json from auto_trader.db (all trade history)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

PORTAL_REPO = Path(__file__).resolve().parents[1]
EDGE_CAPITAL_REPO = PORTAL_REPO.parent / 'edge-capital'
DB_PATH = EDGE_CAPITAL_REPO / 'data' / 'auto_trader.db'
OUTPUT = PORTAL_REPO / 'portal' / 'shared' / 'edge-capital-trades.json'


def parse_pnl_from_reason(reason: str | None) -> float | None:
    """Extract P&L percentage from reason string like 'take_profit (+16.0%)'."""
    if not reason:
        return None
    import re
    m = re.search(r'\(([+-][\d.]+)%\)', reason)
    if m:
        return float(m.group(1))
    return None


def main() -> None:
    if not DB_PATH.exists():
        print(f'ERROR: DB not found at {DB_PATH}')
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    rows = cur.execute(
        'SELECT id, ts, symbol, side, qty, price, order_type, reason, dry_run, strategy, code_version '
        'FROM trades ORDER BY ts DESC'
    ).fetchall()

    trades = []
    for r in rows:
        reason = r['reason'] or ''
        side = r['side'] or ''
        pnl_pct = parse_pnl_from_reason(reason) if side == 'sell' else None

        # Parse score from buy reason like 'score=15.9 buy'
        score = None
        if side == 'buy' and reason:
            import re
            sm = re.search(r'score=([\d.]+)', reason)
            if sm:
                score = float(sm.group(1))

        # Classify exit type
        exit_type = None
        if side == 'sell':
            if 'take_profit' in reason:
                exit_type = 'take_profit'
            elif 'stop_loss' in reason:
                exit_type = 'stop_loss'
            else:
                exit_type = 'manual'

        trades.append({
            'id': r['id'],
            'ts': r['ts'],
            'symbol': r['symbol'],
            'side': side,
            'qty': r['qty'],
            'price': r['price'],
            'order_type': r['order_type'],
            'reason': reason,
            'dry_run': bool(r['dry_run']),
            'strategy': r['strategy'] or 'auto_trader',
            'code_version': r['code_version'] or '',
            'pnl_pct': pnl_pct,
            'score': score,
            'exit_type': exit_type,
        })

    # Stats
    live_trades = [t for t in trades if not t['dry_run']]
    sells = [t for t in live_trades if t['side'] == 'sell']
    buys = [t for t in live_trades if t['side'] == 'buy']
    take_profits = [t for t in sells if t['exit_type'] == 'take_profit']
    stop_losses = [t for t in sells if t['exit_type'] == 'stop_loss']
    pnl_pcts = [t['pnl_pct'] for t in sells if t['pnl_pct'] is not None]
    avg_pnl_pct = sum(pnl_pcts) / len(pnl_pcts) if pnl_pcts else None
    win_rate = len([p for p in pnl_pcts if p > 0]) / len(pnl_pcts) if pnl_pcts else None

    payload = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'source': {
            'db': str(DB_PATH),
            'generator': 'portal/generate-edge-capital-trades.py',
        },
        'stats': {
            'total_trades': len(live_trades),
            'total_buys': len(buys),
            'total_sells': len(sells),
            'take_profits': len(take_profits),
            'stop_losses': len(stop_losses),
            'avg_exit_pnl_pct': avg_pnl_pct,
            'win_rate': win_rate,
        },
        'trades': trades,
    }

    OUTPUT.write_text(json.dumps(payload, indent=2) + '\n')
    print(f'Wrote {len(trades)} trades → {OUTPUT}')
    if avg_pnl_pct is not None:
        print(f'Avg exit P&L: {avg_pnl_pct:+.1f}% | Win rate: {win_rate * 100:.1f}% ({len(take_profits)} TPs, {len(stop_losses)} SLs)')


if __name__ == '__main__':
    main()
