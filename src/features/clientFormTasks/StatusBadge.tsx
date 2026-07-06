// StatusBadge — minimal status pill used by the task row. Lives
// alongside slice #8 because slice #2 (shadcn scaffold) didn't ship
// one. Renders the status as a coloured <span> with a per-status
// background.

import type { TaskStatus } from "@/features/clientFormTasks/clientFormTaskSchema";

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
  /**
   * `compact` renders a small dot-style pill instead of the labelled
   * pill. Used inline in the AttachedTaskRow history list where the
   * label is redundant with the arrow on the same row.
   */
  compact?: boolean;
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: "bg-slate-200 text-slate-800",
  ready_to_file: "bg-amber-200 text-amber-900",
  submitted: "bg-sky-200 text-sky-900",
  done: "bg-emerald-200 text-emerald-900",
  archived: "bg-zinc-300 text-zinc-800",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  ready_to_file: "Ready to file",
  submitted: "Submitted",
  done: "Done",
  archived: "Archived",
};

export default function StatusBadge({
  status,
  className,
  compact,
}: StatusBadgeProps) {
  if (compact) {
    return (
      <span
        data-testid={`status-badge-compact-${status}`}
        title={STATUS_LABELS[status]}
        className={
          "inline-block h-2 w-2 rounded-full " +
          STATUS_STYLES[status].split(" ")[0] +
          (className ? ` ${className}` : "")
        }
      />
    );
  }
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
        STATUS_STYLES[status] +
        (className ? ` ${className}` : "")
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
