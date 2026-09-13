type Props = {
  title: string;
  body?: string;
  icon?: string;
};

export function EmptyState({ title, body, icon = "—" }: Props) {
  return (
    <div className="qgo-empty">
      <div className="qgo-empty__icon" aria-hidden>
        {icon}
      </div>
      <div className="qgo-empty__title">{title}</div>
      {body ? <p className="qgo-empty__body">{body}</p> : null}
    </div>
  );
}
