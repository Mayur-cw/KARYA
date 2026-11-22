import React from "react";

export function Deadline({
  value,
  relative = false,
}: {
  value?: string | null;
  relative?: boolean;
}) {
  if (!value || Number.isNaN(Date.parse(value)))
    return <span className="deadline unset">No deadline set</span>;
  const date = new Date(value);
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  const label =
    days < 0
      ? "Past deadline"
      : days === 0
        ? "Due today"
        : days === 1
          ? "Due tomorrow"
          : `Due in ${days} days`;
  return (
    <time
      dateTime={value}
      className={`deadline${days >= 0 && days <= 3 ? " urgent" : ""}`}
      title={date.toLocaleString()}
    >
      {relative
        ? label
        : date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
    </time>
  );
}
