import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: "/" | "/dashboard";
  compact?: boolean;
};

export function BrandLogo({ href = "/", compact = false }: BrandLogoProps) {
  return (
    <Link aria-label="Codex Pet Arena" className={compact ? "brand brand-compact" : "brand"} href={href}>
      <Image alt="" className="brand-logo" height={941} priority src="/codex-pet-arena-logo.png" width={1672} />
      <span className="sr-only">Codex Pet Arena</span>
    </Link>
  );
}
