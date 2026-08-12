import React from 'react';
import { C, critColor, statusStyle } from '../theme';

export const Tag = ({label,color,bg,size='sm'}) => (
  <span className="kpmg-badge" style={{padding:size==='sm'?'3px 10px':'4px 12px',fontSize:size==='sm'?11.5:12,color,background:bg}}>
    {label}
  </span>
);
export const CritTag = ({c}) => <Tag label={c} color={critColor(c)} bg={critColor(c)+'18'}/>;
export const STag    = ({s}) => { const {fg,bg}=statusStyle(s); return <Tag label={s} color={fg} bg={bg}/>; };

export const Bar2 = ({pct,color,h=6}) => (
  <div className="kpmg-bar-track" style={{h}}>
    <div className="kpmg-bar-fill" style={{width:`${Math.min(100,Math.max(0,pct))}%`,background:color}}/>
  </div>
);

export const Card = ({children,style={},className=''}) => (
  <div className={`kpmg-card ${className}`.trim()} style={style}>
    {children}
  </div>
);

export const SLabel = ({children,sub,action}) => (
  <div className="kpmg-slabel">
    <div className="kpmg-slabel-left">
      {children}
      {sub&&<span className="kpmg-subtext">{sub}</span>}
    </div>
    {action}
  </div>
);

export const ColH = ({children,style={}}) => (
  <div className="kpmg-colh" style={style}>{children}</div>
);

export const Btn = ({children,variant='primary',onClick,disabled=false,size='md',style={}}) => (
  <button onClick={onClick} disabled={disabled} className={`kpmg-btn kpmg-btn-${variant} kpmg-btn-${size}`} style={{opacity:disabled?.4:1,...style}}>
    {children}
  </button>
);

export const Loading = ({text='Loading…'}) => (
  <div className="kpmg-loading">
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}>
      <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </svg>
    {text}
  </div>
);

export const ErrorMsg = ({message,onRetry}) => (
  <div className="kpmg-error-msg">
    <span>⚠ {message}</span>
    {onRetry&&<button className="kpmg-btn-retry" onClick={onRetry}>Retry</button>}
  </div>
);

export const Modal = ({title,subtitle,children,onClose,maxWidth=680,footer,headerRight}) => (
  <div className="kpmg-modal-overlay" onClick={onClose}>
    <div className="kpmg-modal-box" style={{maxWidth}} onClick={e=>e.stopPropagation()}>
      {/* Header */}
      <div className="kpmg-modal-header">
        <div>
          <div className="kpmg-modal-title">{title}</div>
          {subtitle&&<div className="kpmg-modal-subtitle">{subtitle}</div>}
        </div>
        <div className="kpmg-modal-header-right">
          {headerRight}
          <button onClick={onClose} className="kpmg-modal-close-btn">×</button>
        </div>
      </div>
      {/* Scrollable body */}
      <div className="kpmg-modal-body">{children}</div>
      {/* Optional footer */}
      {footer&&<div className="kpmg-modal-footer">{footer}</div>}
    </div>
  </div>
);

export const InfoBlock = ({label,content,color}) => (
  <div className="kpmg-info-block">
    <div className="kpmg-info-label" style={color?{color}:{}}>{label}</div>
    <div className="kpmg-info-content">{content}</div>
  </div>
);

export const SLBadge = ({sl}) => {
  const bg  = ['#F1F5F9','#FFF7ED','#FEFCE8','#F0FDF4','#EFF6FF'][sl]??'#F1F5F9';
  const col = ['#64748B','#EA580C','#CA8A04','#16A34A','#2563EB'][sl]??'#64748B';
  const lbl = ['SL 0','SL 1','SL 2','SL 3','SL 4'][sl]??`SL ${sl}`;
  return <span className="kpmg-sl-badge" style={{background:bg,color:col,border:`1px solid ${col}30`}}>{lbl}</span>;
};

// Pagination control
export const Pagination = ({ page, total, perPage, onChange }) => {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  return (
    <div className="kpmg-pagination">
      <span className="kpmg-pagination-text">
        Showing <strong>{start}</strong> to <strong>{end}</strong> of <strong>{total}</strong> results
      </span>
      <div className="kpmg-pagination-btns">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="kpmg-pagination-nav-btn"
          title="Previous page"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        {Array.from({ length: Math.min(7, pages) }, (_, i) => {
          let p;
          if (pages <= 7) p = i + 1;
          else if (page <= 4) p = i + 1;
          else if (page >= pages - 3) p = pages - 6 + i;
          else p = page - 3 + i;
          if (p < 1 || p > pages) return null;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`kpmg-pagination-num-btn ${p === page ? 'active' : ''}`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === pages}
          className="kpmg-pagination-nav-btn"
          title="Next page"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  );
};

export const FormField = ({label,required,children,hint}) => (
  <div className="kpmg-form-field">
    <label className="kpmg-form-label">
      {label}{required&&<span className="kpmg-req-asterisk">*</span>}
    </label>
    {children}
    {hint&&<div className="kpmg-form-hint">{hint}</div>}
  </div>
);

export const Input = ({value,onChange,placeholder,type='text',style={},className=''}) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    className={`kpmg-input ${className}`.trim()} style={style}
  />
);

export const Select = ({value,onChange,options,style={},className=''}) => (
  <select value={value} onChange={onChange} className={`kpmg-select ${className}`.trim()} style={style}>
    {options.map(o=> typeof o==='string'
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.value} value={o.value}>{o.label}</option>
    )}
  </select>
);

export const Textarea = ({value,onChange,placeholder,rows=4,style={},className=''}) => (
  <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    className={`kpmg-textarea ${className}`.trim()} style={style}
  />
);
