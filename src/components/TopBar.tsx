type Props = {
  title: string;
};

export default function TopBar({ title }: Props) {
  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
    </div>
  );
}