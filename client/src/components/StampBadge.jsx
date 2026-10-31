import React from 'react';

const STAMP_CONFIGS = {
  RECEIPT: {
    label: 'RECEIPT',
    color: 'var(--stamp-receipt)',
    rotation: '-1.5deg',
    bg: 'rgba(31, 95, 74, 0.08)',
  },
  ISSUE_PRODUCTION: {
    label: 'ISSUE',
    color: 'var(--stamp-issue)',
    rotation: '1.2deg',
    bg: 'rgba(63, 73, 72, 0.08)',
  },
  ISSUE: {
    label: 'ISSUE',
    color: 'var(--stamp-issue)',
    rotation: '1.2deg',
    bg: 'rgba(63, 73, 72, 0.08)',
  },
  PRODUCTION_OUTPUT: {
    label: 'OUTPUT',
    color: 'var(--stamp-output)',
    rotation: '-1.8deg',
    bg: 'rgba(35, 83, 99, 0.08)',
  },
  OUTPUT: {
    label: 'OUTPUT',
    color: 'var(--stamp-output)',
    rotation: '-1.8deg',
    bg: 'rgba(35, 83, 99, 0.08)',
  },
  SALE: {
    label: 'SALE',
    color: 'var(--stamp-sale)',
    rotation: '1.4deg',
    bg: 'rgba(42, 59, 92, 0.08)',
  },
  SALES_RETURN: {
    label: 'RETURN',
    color: 'var(--stamp-return)',
    rotation: '-1.2deg',
    bg: 'rgba(120, 76, 40, 0.08)',
  },
  RETURN: {
    label: 'RETURN',
    color: 'var(--stamp-return)',
    rotation: '-1.2deg',
    bg: 'rgba(120, 76, 40, 0.08)',
  },
  SCRAP: {
    label: 'SCRAP',
    color: 'var(--stamp-scrap)',
    rotation: '2deg',
    bg: 'rgba(179, 38, 30, 0.08)',
  },
};

export default function StampBadge({ type }) {
  const norm = String(type || '').toUpperCase();
  const config = STAMP_CONFIGS[norm] || {
    label: norm,
    color: 'var(--ink-secondary)',
    rotation: '0deg',
    bg: 'rgba(0,0,0,0.05)',
  };

  return (
    <span
      className="rubber-stamp"
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-mono)',
        fontSize: '10.5px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: config.color,
        border: `1.5px solid ${config.color}`,
        outline: `1px dashed ${config.color}`,
        outlineOffset: '-3.5px',
        padding: '3px 8px',
        borderRadius: '2px',
        backgroundColor: config.bg,
        transform: `rotate(${config.rotation})`,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {config.label}
    </span>
  );
}

