import React from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import { Deadline } from "./Deadline";
import { Icon } from "./Icon";
interface ProcessCardProps {
  workflowId: string;
  title: string;
  description?: string;
  deadline?: string | null;
  status: string;
  submissionId?: string;
  stages: number;
}
export function ProcessCard({
  workflowId,
  title,
  description,
  deadline,
  status,
  submissionId,
  stages,
}: ProcessCardProps) {
  const guidance: Record<string, string> = {
    needs_changes:
      "Review the feedback, update your answers, and send your application back.",
    draft: "Your draft is saved. Pick up where you left off.",
    unstarted: "Read the requirements and prepare your application.",
    approved:
      "Your application has been approved. Open it to see the recorded outcome.",
    rejected:
      "A decision has been recorded. Open your application to read the feedback.",
  };
  const action = !submissionId
    ? "Start Application"
    : status === "needs_changes"
      ? "Fix & Resubmit"
      : status === "draft"
        ? "Continue draft"
        : "View application";
  return (
    <article className={`card process-card process-${status}`}>
      <div className="process-card-top">
        <span className="document-icon">
          <Icon name="file" size={21} />
        </span>
        <StatusBadge status={status} />
      </div>
      <h2>{title}</h2>
      <p className="process-guidance">
        {description ||
          guidance[status] ||
          "Your application is with the review team. Follow its progress here."}
      </p>
      <div className="process-card-info">
        <span>
          <Icon name="clock" size={15} />
          <Deadline value={deadline} relative />
        </span>
        <span>
          <Icon name="layers" size={15} />
          {stages} review stages
        </span>
      </div>
      <Link
        to={
          submissionId
            ? `/student/submissions/${submissionId}`
            : `/student/workflows/${workflowId}`
        }
        data-testid={submissionId ? "EL-060" : "EL-059"}
        className={`btn ${["unstarted", "draft", "needs_changes"].includes(status) ? "btn-primary" : "btn-secondary"}`}
      >
        {action}
      </Link>
    </article>
  );
}
