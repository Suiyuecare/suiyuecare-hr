type EmptyStateProps = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
    </section>
  );
}

