const LABELS: Record<string, string> = {
  WITH_STUDENT: "Assigned: With Student",
  REPLACED: "Assigned: Replaced",
  RETURNED: "Assigned: Returned",
};

const CLASSES: Record<string, string> = {
  WITH_STUDENT: "badge badge-active",
  REPLACED: "badge badge-warn",
  RETURNED: "badge badge-neutral",
};

export default function StatusBadge({ status }: { status: string }) {
  return <span className={CLASSES[status] || "badge"}>{LABELS[status] || status}</span>;
}
