import { useId } from 'react';
import { t, tp, getLang, PASS } from '../lib/legacy.js';

const number = (n) => new Intl.NumberFormat(getLang(), { maximumFractionDigits: 1 }).format(n);
const date = (d) => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short' }).format(d);

export function WidgetIcon({ type }) {
  const paths = {
    streak: <path d="M13 3c1 5-4 6-2 10 1-2 3-3 4-4 3 3 4 5 3 8a6.5 6.5 0 0 1-12-1C4 11 8 8 13 3Z" />,
    completed: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8 12 3 3 5-6" /></>,
    average: <><path d="M4 19h16M6 15V9m6 6V5m6 10v-4" /><path d="m15 5 3-2 3 2" /></>,
    words: <><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z" /><path d="M12 6v14" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type] || paths.completed}</svg>;
}

export function Gauge({ value, total, label, size = 104 }) {
  const share = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return <svg width={size} height={size} viewBox="0 0 100 100" className="dash-gauge" role="img" aria-label={label}>
    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--fill-strong)" strokeWidth="7" />
    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${share * 100} 100`} transform="rotate(-90 50 50)" />
    <text x="50" y="51" dominantBaseline="middle" textAnchor="middle" fill="var(--text)" fontSize="21" fontWeight="700">{number(Math.round(share * 100))}%</text>
  </svg>;
}

export function Metric({ value, label, detail }) {
  return <div className="dash-metric"><strong>{value}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>;
}

export function WeekStrip({ days }) {
  return <div className="dash-week-strip">{days.map((d) => <div key={d.key} title={tp('dash.act.cell', d.count, { date: date(d.date) })}>
    <span className={d.count ? 'is-active' : ''}>{d.count ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : <i />}</span>
    <small>{new Intl.DateTimeFormat(getLang(), { weekday: 'narrow' }).format(d.date)}</small>
  </div>)}</div>;
}

export function MonthCalendar({ now, counts }) {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const offset = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  return <div className="dash-month-calendar" aria-label={t('dash.month.title')}>
    {Array.from({ length: 7 }, (_, i) => <small key={`label${i}`}>{new Intl.DateTimeFormat(getLang(), { weekday: 'narrow' }).format(new Date(2024, 0, i + 1))}</small>)}
    {Array.from({ length: offset }, (_, i) => <span key={`blank${i}`} />)}
    {Array.from({ length: days }, (_, i) => {
      const day = i + 1, count = counts[day] || 0;
      return <span key={day} className={`${count ? 'is-active' : ''} ${day === now.getDate() ? 'is-today' : ''} ${day > now.getDate() ? 'is-future' : ''}`} title={tp('dash.act.cell', count, { date: date(new Date(now.getFullYear(), now.getMonth(), day)) })}>{number(day)}{count > 0 && <i />}</span>;
    })}
  </div>;
}

export function TrendChart({ points }) {
  const id = useId();
  const W = 480, H = 168, left = 34, right = 14, top = 16, bottom = 30;
  const x = (i) => points.length < 2 ? (W + left - right) / 2 : left + (W - left - right) * i / (points.length - 1);
  const y = (n) => H - bottom - Math.min(1, Math.max(0, n)) * (H - top - bottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.accuracy)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart" role="img" aria-label={t('dash.trend.title')}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".18" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    {[0, .5, 1].map((n) => <g key={n}><line x1={left} x2={W - right} y1={y(n)} y2={y(n)} stroke="var(--border-secondary)" /><text x={left - 8} y={y(n) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{number(n * 100)}%</text></g>)}
    <line x1={left} x2={W - right} y1={y(PASS)} y2={y(PASS)} stroke="var(--text-tertiary)" strokeDasharray="3 5"><title>{t('dash.insight.threshold', { n: number(PASS * 100) })}</title></line>
    {points.length > 1 && <path d={`${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id})`} />}
    <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((p, i) => <g key={i} tabIndex="0" className="dash-chart-point" aria-label={`${date(new Date(p.at))}: ${number(p.accuracy * 100)}%`}>
      <title>{date(new Date(p.at))}: {number(p.accuracy * 100)}%</title><circle cx={x(i)} cy={y(p.accuracy)} r="10" fill="transparent" /><circle cx={x(i)} cy={y(p.accuracy)} r="3.5" fill="var(--bg-container)" stroke="currentColor" strokeWidth="2" />
      <text className="dash-chart-tip" x={Math.min(W - 24, Math.max(24, x(i)))} y={Math.max(10, y(p.accuracy) - 12)} textAnchor="middle" fontSize="10" fill="var(--text)">{number(p.accuracy * 100)}%</text>
    </g>)}
    {points.length > 0 && <><text x={left} y={H - 6} fontSize="10" fill="var(--text-tertiary)">{date(new Date(points[0].at))}</text>{points.length > 1 && <text x={W - right} y={H - 6} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">{date(new Date(points[points.length - 1].at))}</text>}</>}
  </svg>;
}

export function Bars({ bars, target }) {
  const W = 480, H = 168, base = 138, top = 22;
  const max = Math.max(1, target, ...bars.map((b) => b.count));
  const bw = (W - 24) / bars.length;
  const goalY = base - target / max * (base - top);
  return <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart" role="img" aria-label={t('dash.weekly.title')}>
    {bars.map((b, i) => {
      const x = 12 + i * bw + bw / 2, h = b.count / max * (base - top);
      return <g key={i} tabIndex="0" aria-label={tp('dash.act.cell', b.count, { date: date(b.monday) })}>
        <title>{tp('dash.act.cell', b.count, { date: date(b.monday) })}</title>
        <rect x={x - 14} y={top} width="28" height={base - top} rx="6" fill="var(--fill)" />
        {b.count > 0 && <rect x={x - 14} y={base - h} width="28" height={h} rx="6" fill="currentColor" opacity={i === bars.length - 1 ? 1 : .45} />}
        <text x={x} y={Math.max(12, base - h - 7)} textAnchor="middle" fontSize="11" fill="var(--text)" fontWeight="600">{number(b.count)}</text>
        <text x={x} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">{date(b.monday)}</text>
      </g>;
    })}
    <line x1="12" x2={W - 12} y1={goalY} y2={goalY} stroke="var(--text-tertiary)" strokeDasharray="3 5"><title>{t('dash.goal.title')}: {number(target)}</title></line>
  </svg>;
}
