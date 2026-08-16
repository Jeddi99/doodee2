export default function Brand({ href = "/" }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label="DOODEE home">
      <svg viewBox="0 0 42 50" aria-hidden="true">
        <path d="M7 4v38M7 4h7c12 0 21 9 21 19s-9 19-21 19" />
        <path d="M17 13v33M17 13h4c10 0 18 7 18 16s-8 17-18 17" />
      </svg>
      <span>DOODEE</span>
    </a>
  );
}
