const DOODEE_LOGO_SRC = "/doodee-logo.webp";

type DrawDoodeeLogoOptions = {
  x: number;
  y: number;
  text: string;
  font: string;
  textColor: string;
  markSize: number;
  gap?: number;
  align?: "left" | "center";
};

export async function loadDoodeeLogoImage(): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = DOODEE_LOGO_SRC;
  });
}

export function drawDoodeeLogo(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  options: DrawDoodeeLogoOptions
): void {
  const gap = options.gap ?? options.markSize * 0.28;
  ctx.save();
  ctx.font = options.font;
  const textWidth = ctx.measureText(options.text).width;
  const markWidth = image ? options.markSize + gap : 0;
  const width = markWidth + textWidth;
  const startX = options.align === "center" ? options.x - width / 2 : options.x;
  if (image) {
    ctx.drawImage(
      image,
      startX,
      options.y - options.markSize / 2,
      options.markSize,
      options.markSize
    );
  }
  ctx.fillStyle = options.textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(options.text, startX + markWidth, options.y);
  ctx.restore();
}
