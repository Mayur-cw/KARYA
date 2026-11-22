import React from 'react';

export type EntityStatus =
  | 'draft'
  | 'published'
  | 'archived'
  | 'submitted'
  | 'in_review'
  | 'needs_changes'
  | 'approved'
  | 'rejected'
  | string;

interface StatusBadgeProps {
  status: EntityStatus;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const displayLabel = label ?? status.replace(/_/g, ' ');

  const getBadgeClass = (s: string) => {
    switch (s.toLowerCase()) {
      case 'published':
      case 'approved':
        return 'badge-published';
      case 'submitted':
      case 'in_review':
        return 'badge-submitted';
      case 'needs_changes':
        return 'badge-needs_changes';
      case 'rejected':
      case 'archived':
        return 'badge-rejected';
      case 'draft':
      default:
        return 'badge-draft';
    }
  };

  return (
    <span
      className={`badge ${getBadgeClass(status)} ${className}`.trim()}
      aria-label={`Status: ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
}
