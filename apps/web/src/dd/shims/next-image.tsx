/**
 * Stands in for `next/image` in the ported UI, aliased in `vite.config.js`.
 *
 * There is no image optimiser behind a Vite SPA, so this renders a plain <img>
 * and drops the props that only meant something to Next's loader (`quality`,
 * `loader`, `placeholder`, `blurDataURL`, `unoptimized`). What it must get right
 * is `fill`, used at 56 call sites: in Next that means "stretch to the
 * positioned ancestor and ignore width/height", which is a layout contract the
 * surrounding markup depends on. Reproduced here with absolute positioning.
 */
import { forwardRef } from "react";
import type { CSSProperties, ImgHTMLAttributes, Ref } from "react";

type StaticImport = { src: string; height?: number; width?: number };

type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | StaticImport;
  alt: string;
  width?: number | string;
  height?: number | string;
  /** Stretch to the nearest positioned ancestor instead of using width/height. */
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
  unoptimized?: boolean;
  loader?: unknown;
  onLoadingComplete?: (img: HTMLImageElement) => void;
};

const FILL_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  // Next defaults a filled image to `object-fit: cover`; call sites that want
  // something else pass an `object-*` class, which wins via the style merge
  // below only if they use `style`, and via CSS specificity otherwise.
  objectFit: "cover",
};

export const Image = forwardRef(function Image(
  {
    src,
    alt,
    width,
    height,
    fill,
    priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    unoptimized: _unoptimized,
    loader: _loader,
    onLoadingComplete,
    style,
    onLoad,
    ...rest
  }: NextImageProps,
  ref: Ref<HTMLImageElement>,
) {
  const resolved = typeof src === "string" ? src : src.src;
  return (
    <img
      ref={ref}
      src={resolved}
      alt={alt}
      // `fill` and width/height are mutually exclusive in Next, and passing both
      // to a stretched <img> makes browsers reserve the intrinsic box as well.
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      // Next maps `priority` onto eager loading + high fetch priority; without
      // it images below the fold should stay lazy, which is Next's default too.
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      style={fill ? { ...FILL_STYLE, ...style } : style}
      onLoad={(event) => {
        onLoad?.(event);
        onLoadingComplete?.(event.currentTarget);
      }}
      {...rest}
    />
  );
});

export default Image;
