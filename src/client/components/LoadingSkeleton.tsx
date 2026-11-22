import React from "react";
interface LoadingSkeletonProps {
  label?: string;
  lines?: number;
  className?: string;
}
export function LoadingSkeleton({
  label = "Loading your workspace…",
  lines = 3,
  className = "",
}: LoadingSkeletonProps) {
  return (
    <div
      className={`loading-state ${className}`}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="loading-caption">
        <span className="loading-spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div className="skeleton-line" key={index} />
        ))}
      </div>
    </div>
  );
}
