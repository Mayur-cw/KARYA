import React from "react";
import { Icon } from "./Icon";
interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state ${className}`}
      role="region"
      aria-label={title}
    >
      <span className="empty-state-icon">
        <Icon name="inbox" size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel &&
        (actionHref ? (
          <a href={actionHref} className="btn btn-primary btn-sm">
            {actionLabel}
          </a>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="btn btn-primary btn-sm"
          >
            {actionLabel}
          </button>
        ))}
    </div>
  );
}
