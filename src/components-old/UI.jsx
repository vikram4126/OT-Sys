import React from 'react';
import { C, critColor, statusStyle } from '../theme';

export const Tag = ({label,color,bg,size='sm'}) => (
  <span style={{display:'inline-flex',alignItems:'center',padding:size==='sm'?'3px 10px':'4px 12px',borderRadius:5,fontSize:size==='sm'?11:12,fontWeight:600,color,background:bg,whiteSpace:'nowrap',letterSpacing:.1}}>
    {label}
  </span>
);
export const CritTag = ({c}) => <Tag label={c} color={critColor(c)} bg={critColor(c)+'18'}/>;
export const STag    = ({s}) => { const {fg,bg}=statusStyle(s); return <Tag label={s} color={fg} bg={bg}/>; };

export const Bar2 = ({pct,color,h=6}) => (
  <div style={{flex:1,height:h,borderRadius:3,background:'#E2E8F4',overflow:'hidden'}}>
    <div style={{height:'100%',width:`${Math.min(100,Math.max(0,pct))}%`,background:color,borderRadius:3,transition:'width .4s ease'}}/>
  </div>
);

export const Card = ({children,style={}}) => (
  <div style={{background:C.surface,borderRadius:12,padding:'20px 24px',border:`1px solid ${C.border}`,boxShadow:'0 1px 4px rgba(0,51,141,.05)',...style}}>
    {children}
  </div>
);

export const SLabel = ({children,sub,action}) => (
  <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:14,display:'flex',alignItems:'center',gap:8,justifyContent:'space-between'}}>
    <div style={{display:'flex',alignItems:'baseline',gap:8}}>
      {children}
      {sub&&<span style={{fontSize:12,color:C.muted,fontWeight:400}}>{sub}</span>}
    </div>
    {action}
  </div>
);

export const ColH = ({children,style={}}) => (
  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:.8,...style}}>{children}</div>
);

export const Btn = ({children,variant='primary',onClick,disabled=false,size='md',style={}}) => {
  const pad = size==='sm' ? '5px 12px' : '8px 18px';
  const fnt = size==='sm' ? 12 : 13;
  return (
    <button onClick={onClick} disabled={disabled} style={{display:'inline-flex',alignItems:'center',gap:6,padding:pad,borderRadius:7,fontSize:fnt,fontWeight:600,cursor:disabled?'not-allowed':'pointer',background:variant==='primary'?C.navy:variant==='danger'?C.critical:'transparent',color:variant==='primary'||variant==='danger'?'#fff':C.navy,border:variant==='outline'?`1.5px solid ${C.border}`:variant==='danger-outline'?`1.5px solid ${C.critical}22`:'none',opacity:disabled?.4:1,...style}}>
      {children}
    </button>
  );
};

export const Loading = ({text='Loading…'}) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'64px 0',color:C.muted,fontSize:14}}>
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}>
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
  <div style={{padding:'14px 18px',background:'#FEE4E2',border:'1px solid #FECACA',borderRadius:10,color:'#DC2626',fontSize:13,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
    <span>⚠ {message}</span>
    {onRetry&&<button onClick={onRetry} style={{background:'none',border:'1px solid #DC2626',borderRadius:5,padding:'4px 12px',color:'#DC2626',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>Retry</button>}
  </div>
);

export const Modal = ({title,subtitle,children,onClose,maxWidth=680,footer,headerRight}) => (
  <div style={{position:'fixed',inset:0,background:'rgba(10,22,40,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(3px)',padding:24}} onClick={onClose}>
    <div style={{background:C.surface,borderRadius:14,maxWidth,width:'100%',maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,51,141,.2)'}} onClick={e=>e.stopPropagation()}>
      {/* Header */}
      <div style={{padding:'20px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0}}>
        <div>
          {subtitle&&<div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:.9,textTransform:'uppercase',marginBottom:4}}>{subtitle}</div>}
          <div style={{fontWeight:700,fontSize:16,color:C.text}}>{title}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginLeft:16}}>
          {headerRight}
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:24,color:C.muted,lineHeight:1,padding:'0 2px'}}>×</button>
        </div>
      </div>
      {/* Scrollable body */}
      <div style={{padding:'20px 24px',overflowY:'auto',flex:1}}>{children}</div>
      {/* Optional footer */}
      {footer&&<div style={{padding:'16px 24px',borderTop:`1px solid ${C.border}`,flexShrink:0,display:'flex',gap:10,justifyContent:'flex-end'}}>{footer}</div>}
    </div>
  </div>
);

export const InfoBlock = ({label,content,color}) => (
  <div style={{marginBottom:16}}>
    <div style={{fontSize:11,fontWeight:700,color:color||C.navy,textTransform:'uppercase',letterSpacing:.8,marginBottom:6}}>{label}</div>
    <div style={{fontSize:13,color:C.text,background:'#F5F8FD',borderRadius:8,padding:'12px 16px',lineHeight:1.75,whiteSpace:'pre-line',border:`1px solid ${C.border}`}}>{content}</div>
  </div>
);

export const SLBadge = ({sl}) => {
  const bg  = ['#F1F5F9','#FFF7ED','#FEFCE8','#F0FDF4','#EFF6FF'][sl]??'#F1F5F9';
  const col = ['#64748B','#EA580C','#CA8A04','#16A34A','#2563EB'][sl]??'#64748B';
  const lbl = ['SL 0','SL 1','SL 2','SL 3','SL 4'][sl]??`SL ${sl}`;
  return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 9px',borderRadius:5,fontSize:11,fontWeight:700,background:bg,color:col,border:`1px solid ${col}30`}}>{lbl}</span>;
};

// Pagination control
export const Pagination = ({page,total,perPage,onChange}) => {
  const pages = Math.ceil(total/perPage);
  if (pages<=1) return null;
  const start = (page-1)*perPage+1;
  const end   = Math.min(page*perPage, total);
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderTop:`1px solid ${C.border}`,background:'#FAFBFF'}}>
      <span style={{fontSize:12,color:C.muted}}>Showing {start}–{end} of {total}</span>
      <div style={{display:'flex',gap:4}}>
        <button onClick={()=>onChange(page-1)} disabled={page===1}
          style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',cursor:page===1?'not-allowed':'pointer',fontSize:12,color:page===1?C.muted:C.text,fontWeight:500,opacity:page===1?.5:1}}>← Prev</button>
        {Array.from({length:Math.min(7,pages)},(_,i)=>{
          let p;
          if (pages<=7) p=i+1;
          else if (page<=4) p=i+1;
          else if (page>=pages-3) p=pages-6+i;
          else p=page-3+i;
          if (p<1||p>pages) return null;
          return (
            <button key={p} onClick={()=>onChange(p)}
              style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${p===page?C.navy:C.border}`,background:p===page?C.navy:'#fff',color:p===page?'#fff':C.text,cursor:'pointer',fontSize:12,fontWeight:p===page?700:500,minWidth:34}}>
              {p}
            </button>
          );
        })}
        <button onClick={()=>onChange(page+1)} disabled={page===pages}
          style={{padding:'5px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',cursor:page===pages?'not-allowed':'pointer',fontSize:12,color:page===pages?C.muted:C.text,fontWeight:500,opacity:page===pages?.5:1}}>Next →</button>
      </div>
    </div>
  );
};

export const FormField = ({label,required,children,hint}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:'block',fontSize:12,fontWeight:600,color:C.text,marginBottom:5}}>
      {label}{required&&<span style={{color:C.critical,marginLeft:3}}>*</span>}
    </label>
    {children}
    {hint&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{hint}</div>}
  </div>
);

export const Input = ({value,onChange,placeholder,type='text',style={}}) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={{width:'100%',padding:'9px 12px',borderRadius:7,border:`1.5px solid ${C.border}`,fontSize:13,color:C.text,background:'#fff',outline:'none',fontFamily:'inherit',transition:'border-color .15s',...style}}
    onFocus={e=>e.target.style.borderColor=C.navy}
    onBlur={e=>e.target.style.borderColor=C.border}
  />
);

export const Select = ({value,onChange,options,style={}}) => (
  <select value={value} onChange={onChange}
    style={{width:'100%',padding:'9px 12px',borderRadius:7,border:`1.5px solid ${C.border}`,fontSize:13,color:C.text,background:'#fff',outline:'none',fontFamily:'inherit',...style}}>
    {options.map(o=> typeof o==='string'
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.value} value={o.value}>{o.label}</option>
    )}
  </select>
);

export const Textarea = ({value,onChange,placeholder,rows=4,style={}}) => (
  <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    style={{width:'100%',padding:'9px 12px',borderRadius:7,border:`1.5px solid ${C.border}`,fontSize:13,color:C.text,background:'#fff',outline:'none',fontFamily:'inherit',resize:'vertical',lineHeight:1.6,...style}}
    onFocus={e=>e.target.style.borderColor=C.navy}
    onBlur={e=>e.target.style.borderColor=C.border}
  />
);
