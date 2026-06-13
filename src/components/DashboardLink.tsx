import Link from "next/link";

type DashboardLinkProps = {
  href: string;
  label: string;
};

export function DashboardLink({ href, label }: DashboardLinkProps) {
  return (
    <Link className="button" href={href}>
      {label}
    </Link>
  );
}

