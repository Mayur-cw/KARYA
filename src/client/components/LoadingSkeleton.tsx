import React from 'react';

interface LoadingSkeletonProps {
  label?: string;
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({
  label = 'Loading operational data...',
  lines = 3,
  className = '',
}: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`skeleton-container ${className}`.trim()}
      style={{ padding: '24px 0' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <div
          style={{
            width: '18px',
            height: '18px',
            border: '2px solid var(--border-medium)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: '14px', color: 'var(--ink-muted)', fontWeight: 500 }}>
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              height: i === 0 ? '28px' : '20px',
              width: i === 0 ? '60%' : i === lines - 1 ? '40%' : '90%',
              backgroundColor: 'var(--bg-muted)',
              borderRadius: 'var(--radius-sm)',
              opacity: 0.7,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
