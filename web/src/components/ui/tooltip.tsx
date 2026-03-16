export function Tooltip({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-10 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950 px-3 py-1 text-xs text-white shadow-lg group-hover:block">
        {label}
      </span>
    </span>
  );
}
