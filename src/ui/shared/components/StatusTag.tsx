interface StatusTagProps {
  label: string;
  tone?: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
}

export function StatusTag({ label, tone = 'neutral' }: StatusTagProps) {
  return <span className={`tag tag-${tone}`}>{label}</span>;
}
