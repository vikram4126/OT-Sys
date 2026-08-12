// Light theme — mapped to KPMG branding variables from index.css
export const C = {
  navy:    'var(--theme-navy)',      // #00338d
  navyDeep:'var(--theme-navy-deep)', // #0c233c
  sky:     'var(--theme-sky)',       // #76d2ff
  violet:  'var(--theme-violet)',    // #510dbc
  lavender:'var(--theme-lavender)',  // #b497ff
  critical:'var(--theme-critical)',
  high:    'var(--theme-high)',
  low:     'var(--theme-low)',       // #098e7e
  bg:      'var(--theme-bg)',
  surface: 'var(--theme-surface)',
  border:  'var(--theme-border)',
  text:    'var(--theme-text)',
  muted:   'var(--theme-muted)',
};

export const critColor = c =>
  c==='Critical'?C.critical : c==='High'?C.high : c==='Medium'?C.navy : C.low;

export const statusStyle = s =>
  s==='Compliant' ? {fg:C.low, bg:'#E6F9F1'} :
  s==='Partial'   ? {fg:'#B45309', bg:'#FEF3C7'} :
                    {fg:C.critical, bg:'#FEE2E2'};

// Using KPMG secondary palette for charts/levels if applicable
export const slColor = sl =>
  ['#94A3B8','var(--kpmg-secondary-blue)','var(--kpmg-secondary-green)','var(--kpmg-secondary-dark-green)','var(--kpmg-secondary-dark-purple)'][sl] ?? '#94A3B8';

export const slLabel = sl =>
  ['None','Low','Medium','High','Very High'][sl] ?? 'Unknown';

// Global Score Colors based on percentage threshold
export const SCORE_COLORS = {
  green: '#0d8770',
  orange: '#f97216',
  red: '#be113c',
};

export function getScoreColor(score) {
  if (score >= 90) return SCORE_COLORS.green;
  if (score >= 70) return SCORE_COLORS.orange;
  return SCORE_COLORS.red;
}

export function getScoreClass(score) {
  if (score >= 90) return 'good';
  if (score >= 70) return 'medium';
  return 'danger';
}
