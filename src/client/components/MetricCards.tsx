import React from 'react';
import { Icon, type IconName } from './Icon';
export function MetricCards({ items, loading, error = false }: { items: { title: string; value: number; description: string; icon: IconName; featured?: boolean }[]; loading: boolean; error?: boolean }) {
  return <section className="stats-grid" aria-label="Workspace summary">{items.map(item => <article key={item.title} className={`card stat-card${item.featured ? ' featured' : ''}`}><div className="stat-top"><span>{item.title}</span><span className="stat-icon"><Icon name={item.icon} size={18} /></span></div><div className="stat-value">{loading || error ? '—' : item.value}</div><p className="stat-description">{item.description}</p></article>)}</section>;
}
