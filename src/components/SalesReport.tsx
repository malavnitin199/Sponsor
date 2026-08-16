import { useMemo, useState } from 'react';
import { Sale, User, PaymentRecord } from '../types';
import { getSalePoints, getSaleAgreementValueINR } from '../lib/points';
import { Download, Search } from 'lucide-react';

/**
 * `/sales-report` — the sales ledger as a dense data table.
 *
 * Deliberately data-first rather than presentation-first: the dashboard's card
 * layout is readable but hides fields behind vertical scrolling, which makes
 * comparing bookings on a phone impractical. Here every field is a column, the
 * unit number is pinned left, and the grid scrolls in both axes.
 *
 * Read-only by design — editing (payments, milestone status) stays in the
 * AdminPanel Sales tab so this page can't half-apply a write.
 */
interface SalesReportProps {
  sales: Sale[];
  users: User[];
  /** Shown under the title, e.g. to say the list is scoped to one agent. */
  scopeNote?: string;
}

type BookingFilter = 'ALL' | 'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE';

const formatPoints = (val: number) => `${Math.round(val || 0).toLocaleString()}`;
const formatINR = (val: number) => `₹${Math.round(val || 0).toLocaleString('en-IN')}`;

/**
 * `sizeSqYards` is stored inconsistently — '100' when seeded, but '100 Sq Yards'
 * when written by the booking form (AdminPanel appends the unit). Strip to the
 * number and apply exactly one unit, mirroring what points.ts does for the math.
 */
const formatPlotSize = (raw?: string) => {
  const n = parseFloat(String(raw ?? '').replace(/[^\d.]/g, '')) || 0;
  return n > 0 ? `${n} sq yd` : '—';
};

/** Mirrors AdminPanel: a bare tokenAmount counts as the first receipt. */
function getSalePayments(s: Sale): PaymentRecord[] {
  if (s.payments && s.payments.length > 0) return s.payments;
  if (s.tokenAmount !== undefined) {
    return [{
      id: `PAY-INIT-${s.id}`,
      amount: s.tokenAmount,
      date: s.saleDate || '',
      paymentMode: 'BANK_TRANSFER',
      notes: 'Initial token amount',
    }];
  }
  return [];
}

const BOOKING_LABELS: Record<string, string> = {
  TOKEN_RECEIVED: 'Token Received',
  BOOKING_DONE: 'Booking Done (30%)',
  REGISTRY_DONE: 'Registry Done (100%)',
};

const bookingChipClasses = (status?: string) =>
  status === 'REGISTRY_DONE'
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : status === 'BOOKING_DONE'
    ? 'bg-blue-50 text-blue-800 border-blue-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';

/**
 * Shared cell padding — tight enough that several columns fit a phone scroll.
 * Row separators live on the cells, not on <tr>: the table uses
 * `border-separate`, where row-level borders are not rendered at all.
 */
const CELL = 'px-2.5 py-2 whitespace-nowrap border-b border-stone-200';
/** Pinned column: opaque background so scrolled content passes behind it. */
const STICKY_CELL = `${CELL} sticky left-0 bg-white border-r border-stone-200 z-10`;

export default function SalesReport({ sales, users, scopeNote }: SalesReportProps) {
  const [query, setQuery] = useState('');
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>('ALL');

  /** Flattens each sale into exactly the columns rendered (and exported). */
  const rows = useMemo(() => {
    const byId = new Map(users.map(u => [u.id?.toUpperCase(), u]));

    return sales.map(sale => {
      const agent = byId.get(sale.agentId?.toUpperCase());
      // "Reference" = the sponsor who introduced the booking agent (upline).
      const sponsor = agent?.sponsorId ? byId.get(agent.sponsorId.toUpperCase()) : undefined;

      const payments = getSalePayments(sale);
      const paid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const agreement = getSaleAgreementValueINR(sale);

      return {
        sale,
        unitNumber: sale.unitNumber || '—',
        plotSize: formatPlotSize(sale.sizeSqYards),
        points: getSalePoints(sale),
        agreement,
        paid,
        due: Math.max(0, agreement - paid),
        date: sale.saleDate || '—',
        buyer: sale.buyerName || '—',
        userId: sale.agentId || '—',
        userName: sale.agentName || agent?.name || '—',
        refId: sponsor?.id || (agent?.sponsorId ?? '—'),
        refName: sponsor?.name || '—',
        refNo: sale.referenceNumber || '—',
        bookingStatus: sale.bookingStatus || 'TOKEN_RECEIVED',
        allotment: sale.status === 'HOLD' ? 'HOLD' : 'CONFIRMED',
        project: sale.project || '—',
        bookingId: sale.id,
      };
    });
  }, [sales, users]);

  /**
   * Query-only view. Chip counts must honour the search but NOT the milestone
   * filter — otherwise every unselected chip would read 0.
   */
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.unitNumber, r.buyer, r.userId, r.userName, r.refId, r.refName, r.refNo, r.bookingId, r.project]
        .some(v => String(v).toLowerCase().includes(q)));
  }, [rows, query]);

  const filtered = useMemo(
    () => (bookingFilter === 'ALL' ? searched : searched.filter(r => r.bookingStatus === bookingFilter)),
    [searched, bookingFilter]);

  const totals = useMemo(() => ({
    count: filtered.length,
    points: filtered.reduce((a, r) => a + r.points, 0),
    agreement: filtered.reduce((a, r) => a + r.agreement, 0),
  }), [filtered]);

  const exportCSV = () => {
    const headers = ['Unit No.', 'Plot Size', 'Points', 'Plot Value (INR)', 'Paid (INR)', 'Due (INR)',
      'Date', 'Buyer', 'User ID', 'User Name', 'Ref. ID', 'Ref. Name', 'Ref. No.',
      'Booking Status', 'Allotment', 'Project', 'Booking ID'];
    const body = filtered.map(r => [
      r.unitNumber, r.plotSize, String(r.points), String(r.agreement), String(r.paid), String(r.due),
      r.date, r.buyer, r.userId, r.userName, r.refId, r.refName, r.refNo,
      BOOKING_LABELS[r.bookingStatus] || r.bookingStatus, r.allotment, r.project, r.bookingId,
    ]);
    const csv = [headers, ...body]
      .map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sbr_sales_report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header + controls */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-stone-200 bg-stone-50/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wide">Sales Report</h3>
            <p className="text-[10.5px] text-stone-500 mt-0.5">
              {scopeNote || 'Full booking ledger · scroll sideways for all columns'}
            </p>
          </div>
          <button
            type="button"
            onClick={exportCSV}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search unit, buyer, user, reference…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-1 focus:ring-emerald-700"
            />
          </div>

          {/* Booking-milestone filter. Counts reflect the search, not the filter. */}
          <div className="flex gap-1 overflow-x-auto custom-scrollbar -mx-1 px-1">
            {([
              { key: 'ALL' as const, label: 'All' },
              { key: 'TOKEN_RECEIVED' as const, label: 'Token' },
              { key: 'BOOKING_DONE' as const, label: 'Booking' },
              { key: 'REGISTRY_DONE' as const, label: 'Registry' },
            ]).map(({ key, label }) => {
              const count = key === 'ALL'
                ? searched.length
                : searched.filter(r => r.bookingStatus === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBookingFilter(key)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    bookingFilter === key
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Totals for the current filter */}
          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            {[
              { label: 'Bookings', value: String(totals.count) },
              { label: 'Points', value: formatPoints(totals.points) },
              { label: 'Value', value: formatINR(totals.agreement) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5">
                <span className="block text-[8.5px] font-bold uppercase tracking-wider text-stone-400">{label}</span>
                <span className="block font-mono font-bold text-[11px] text-stone-900 truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The grid. Scrolls both axes; header row and first column stay pinned.
          The scroll container is `relative` + isolate so the sticky cells layer
          against each other and never against the app's sticky page header. */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="relative isolate overflow-auto max-h-[68vh] custom-scrollbar">
          {/* border-separate (not -collapse): with collapsed borders the browser
              owns the border box, so borders on sticky cells scroll away. */}
          <table className="w-full text-left border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr className="bg-stone-50 text-[9px] uppercase font-bold text-stone-500 tracking-wider">
                {/* Corner cell must outrank both the sticky row and sticky column */}
                <th className={`${CELL} sticky left-0 top-0 z-30 bg-stone-50 border-r border-stone-200`}>
                  Unit No.
                </th>
                {['Plot Size', 'Points', 'Plot Value', 'Paid', 'Due', 'Date', 'Buyer', 'User ID',
                  'User Name', 'Ref. ID', 'Ref. Name', 'Ref. No.', 'Booking Status', 'Allotment', 'Project', 'Booking ID',
                ].map(h => (
                  <th key={h} className={`${CELL} sticky top-0 z-20 bg-stone-50`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-stone-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-10 text-center text-stone-400 text-xs font-medium">
                    {sales.length === 0
                      ? 'No bookings recorded yet.'
                      : 'No bookings match this search or filter.'}
                  </td>
                </tr>
              ) : (
                // Row hover is solid (not translucent) so it matches the pinned
                // cell, which must be fully opaque to hide content scrolling under it.
                filtered.map(r => (
                  <tr key={r.bookingId} className="group hover:bg-stone-50">
                    <td className={`${STICKY_CELL} font-bold text-stone-900 group-hover:bg-stone-50`}>
                      {r.unitNumber}
                    </td>
                    <td className={`${CELL} font-mono text-stone-600`}>{r.plotSize}</td>
                    <td className={`${CELL} font-mono font-bold text-emerald-800`}>{formatPoints(r.points)}</td>
                    <td className={`${CELL} font-mono font-bold text-stone-900`}>{formatINR(r.agreement)}</td>
                    <td className={`${CELL} font-mono text-stone-700`}>{formatINR(r.paid)}</td>
                    <td className={`${CELL} font-mono ${r.due > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {r.due > 0 ? formatINR(r.due) : 'Paid'}
                    </td>
                    <td className={`${CELL} font-mono text-stone-500`}>{r.date}</td>
                    <td className={`${CELL} font-semibold text-stone-800`}>{r.buyer}</td>
                    <td className={`${CELL} font-mono text-stone-600`}>{r.userId}</td>
                    <td className={`${CELL} text-stone-800`}>{r.userName}</td>
                    <td className={`${CELL} font-mono text-stone-600`}>{r.refId}</td>
                    <td className={`${CELL} text-stone-800`}>{r.refName}</td>
                    <td className={`${CELL} font-mono text-stone-500`}>{r.refNo}</td>
                    <td className={CELL}>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold border ${bookingChipClasses(r.bookingStatus)}`}>
                        {BOOKING_LABELS[r.bookingStatus] || r.bookingStatus}
                      </span>
                    </td>
                    <td className={CELL}>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                        r.allotment === 'HOLD'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {r.allotment}
                      </span>
                    </td>
                    <td className={`${CELL} text-stone-600`}>{r.project}</td>
                    <td className={`${CELL} font-mono text-stone-500`}>{r.bookingId}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-stone-400 px-1">
        Unit column stays pinned while you scroll sideways. Points and INR are derived from
        plot size × units × rate — editing happens in the Admin → Sales tab.
      </p>
    </div>
  );
}
