import Image from "next/image";

type DoodeeLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  priority?: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DoodeeLogo({
  className,
  markClassName,
  wordmarkClassName,
  subtitle,
  subtitleClassName,
  priority = true,
}: DoodeeLogoProps) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)} aria-label="DOODEE">
      <Image
        src="/doodee-logo.webp"
        alt=""
        width={44}
        height={44}
        decoding="async"
        priority={priority}
        draggable={false}
        className={cx("h-10 w-10 rounded-2xl object-contain", markClassName)}
      />
      <span className="min-w-0">
        <span
          className={cx(
            "block font-serif text-[1.55rem] font-light leading-none tracking-normal",
            wordmarkClassName
          )}
          aria-hidden
        >
          DOODEE
        </span>
        {subtitle ? (
          <span
            className={cx(
              "mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em]",
              subtitleClassName
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
