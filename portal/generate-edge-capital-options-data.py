#!/usr/bin/env python3
"""Generate portal/shared/edge-capital-options.json from live Edge Capital sources."""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

PORTAL_REPO = Path(__file__).resolve().parents[1]
EDGE_CAPITAL_REPO = PORTAL_REPO.parent / 'edge-capital'
OUTPUT = PORTAL_REPO / 'portal' / 'shared' / 'edge-capital-options.json'

sys.path.insert(0, str(EDGE_CAPITAL_REPO))

from src.broker import AlpacaBroker  # type: ignore
from src.config import get_alpaca_options_paper_key, get_alpaca_options_paper_secret  # type: ignore


def to_float(value):
    if value in (None, ''):
        return None
    try:
        return float(value)
    except Exception:
        return None


def main() -> None:
    broker = AlpacaBroker(use_options_paper=True)
    account = broker.account()
    payload = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'source': {
            'alpaca_options_paper': True,
            'edge_capital_repo': str(EDGE_CAPITAL_REPO),
            'generator': 'portal/generate-edge-capital-options-data.py',
        },
        'account': {
            'id': account.get('id'),
            'status': account.get('status'),
            'currency': account.get('currency'),
            'portfolio_value': to_float(account.get('portfolio_value')),
            'equity': to_float(account.get('equity')),
            'cash': to_float(account.get('cash')),
            'buying_power': to_float(account.get('buying_power')),
            'options_buying_power': to_float(account.get('options_buying_power')),
            'options_approved_level': account.get('options_approved_level'),
            'options_trading_level': account.get('options_trading_level'),
            'multiplier': account.get('multiplier'),
            'pattern_day_trader': account.get('pattern_day_trader'),
            'trading_blocked': account.get('trading_blocked'),
            'account_blocked': account.get('account_blocked'),
            'created_at': account.get('created_at'),
        },
        'open_positions': [],
        'recent_orders': [],
        'recent_activities': [],
        'pnl': {
            'unrealized_total': None,
            'realized_total': None,
            'note': 'No provable options P&L available from current live export.',
        },
        'wheel': {
            'last_run': None,
            'last_result': None,
            'active_positions': [],
            'recent_candidates': [],
            'research_summary': {
                'total_signals': 0,
                'closed_signals': 0,
                'premium_kept_total': None,
                'realized_pnl_total': None,
            },
        },
        'readiness': {
            'credentials_present': bool(get_alpaca_options_paper_key() and get_alpaca_options_paper_secret()),
            'account_accessible': True,
            'options_enabled': bool(account.get('options_approved_level') or account.get('options_trading_level')),
            'has_open_positions': False,
            'has_recent_orders': False,
            'has_realized_pnl': False,
            'has_unrealized_pnl': False,
            'has_wheel_activity': False,
        },
    }

    for pos in broker.options_positions():
        payload['open_positions'].append({
            'symbol': pos.get('symbol'),
            'underlying_symbol': pos.get('underlying_symbol'),
            'qty': to_float(pos.get('qty')),
            'side': pos.get('side'),
            'market_value': to_float(pos.get('market_value')),
            'cost_basis': to_float(pos.get('cost_basis')),
            'avg_entry_price': to_float(pos.get('avg_entry_price')),
            'current_price': to_float(pos.get('current_price')),
            'unrealized_pl': to_float(pos.get('unrealized_pl')),
            'unrealized_plpc': to_float(pos.get('unrealized_plpc')),
            'asset_class': pos.get('asset_class'),
            'exchange': pos.get('exchange'),
            'asset_id': pos.get('asset_id'),
        })

    try:
        orders = broker._get('/orders', params={'status': 'all', 'limit': 100, 'nested': 'true', 'direction': 'desc'})
    except Exception:
        orders = []
    for order in orders:
        symbol = (order.get('symbol') or '').strip()
        looks_option = order.get('asset_class') in ('option', 'options') or len(symbol) > 15
        if not looks_option:
            continue
        payload['recent_orders'].append({
            'id': order.get('id'),
            'client_order_id': order.get('client_order_id'),
            'symbol': symbol,
            'status': order.get('status'),
            'side': order.get('side'),
            'order_type': order.get('type'),
            'order_class': order.get('order_class'),
            'time_in_force': order.get('time_in_force'),
            'qty': order.get('qty'),
            'filled_qty': order.get('filled_qty'),
            'filled_avg_price': order.get('filled_avg_price'),
            'limit_price': order.get('limit_price'),
            'stop_price': order.get('stop_price'),
            'created_at': order.get('created_at'),
            'submitted_at': order.get('submitted_at'),
            'filled_at': order.get('filled_at'),
            'expired_at': order.get('expired_at'),
            'canceled_at': order.get('canceled_at'),
            'legs': [{
                'symbol': leg.get('symbol'),
                'side': leg.get('side'),
                'qty': leg.get('qty'),
                'filled_qty': leg.get('filled_qty'),
                'type': leg.get('type'),
                'status': leg.get('status'),
            } for leg in (order.get('legs') or [])],
        })

    try:
        activities = broker._get('/account/activities', params={'activity_types': 'FILL', 'page_size': 100})
    except Exception:
        activities = []
    for activity in activities:
        symbol = (activity.get('symbol') or '').strip()
        if symbol and len(symbol) > 15:
            payload['recent_activities'].append({
                key: activity.get(key)
                for key in ['id', 'activity_type', 'transaction_time', 'type', 'side', 'symbol', 'qty', 'price', 'net_amount', 'description', 'order_id']
            })

    wheel_json = EDGE_CAPITAL_REPO / 'data' / 'wheel_dashboard.json'
    if wheel_json.exists():
        wheel_data = json.loads(wheel_json.read_text())
        payload['wheel']['last_run'] = wheel_data.get('last_run')
        payload['wheel']['last_result'] = wheel_data.get('last_result')
        payload['wheel']['active_positions'] = wheel_data.get('positions') or []

    con = sqlite3.connect(EDGE_CAPITAL_REPO / 'data' / 'edge_capital.db')
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    payload['wheel']['recent_candidates'] = [
        dict(row)
        for row in cur.execute(
            "SELECT ticker, captured_at, trade_type, spot_price, strike, otm_pct, dte, premium, ann_yield, iv_rank, iv_percentile, analyst_score, days_to_earnings, outcome, premium_kept, pnl, exit_reason FROM wheel_signals ORDER BY captured_at DESC LIMIT 12"
        ).fetchall()
    ]
    total_signals = cur.execute('SELECT COUNT(*) FROM wheel_signals').fetchone()[0]
    closed_signals = cur.execute("SELECT COUNT(*) FROM wheel_signals WHERE outcome IS NOT NULL").fetchone()[0]
    premium_kept_total = cur.execute("SELECT SUM(premium_kept) FROM wheel_signals WHERE outcome IS NOT NULL").fetchone()[0]
    realized_pnl_total = cur.execute("SELECT SUM(pnl) FROM wheel_signals WHERE outcome IS NOT NULL").fetchone()[0]
    payload['wheel']['research_summary'] = {
        'total_signals': total_signals,
        'closed_signals': closed_signals,
        'premium_kept_total': premium_kept_total,
        'realized_pnl_total': realized_pnl_total,
    }

    if payload['open_positions']:
        payload['pnl']['unrealized_total'] = sum((row.get('unrealized_pl') or 0) for row in payload['open_positions'])
        payload['pnl']['note'] = 'Unrealized P&L derived from open Alpaca options positions. Realized P&L still unavailable from current export.'
        payload['readiness']['has_unrealized_pnl'] = True
    if realized_pnl_total not in (None, ''):
        payload['pnl']['realized_total'] = realized_pnl_total
        payload['pnl']['note'] = 'Realized P&L shown only when recorded in wheel research history.'
        payload['readiness']['has_realized_pnl'] = True

    payload['readiness']['has_open_positions'] = bool(payload['open_positions'])
    payload['readiness']['has_recent_orders'] = bool(payload['recent_orders'] or payload['recent_activities'])
    payload['readiness']['has_wheel_activity'] = bool(payload['wheel']['recent_candidates'] or payload['wheel']['active_positions'])

    OUTPUT.write_text(json.dumps(payload, indent=2) + '\n')
    print(f'Wrote {OUTPUT}')


if __name__ == '__main__':
    main()
