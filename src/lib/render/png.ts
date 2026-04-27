import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

/**
 * Slide template — a structured spec the LLM emits. We convert this to
 * JSX-shaped objects for Satori (no JSX runtime needed). Keeping it
 * structured (instead of raw HTML) keeps the LLM's output predictable
 * and easy to validate.
 */
export type SlideElement =
  | {
      type: "heading";
      text: string;
      size?: "lg" | "xl" | "2xl" | "3xl" | "4xl";
      color?: string;
      align?: "left" | "center" | "right";
      weight?: 400 | 600 | 700 | 900;
    }
  | { type: "subheading"; text: string; color?: string; align?: "left" | "center" | "right" }
  | { type: "body"; text: string; color?: string; align?: "left" | "center" | "right" }
  | { type: "badge"; text: string; bg?: string; color?: string }
  | { type: "spacer"; size?: "sm" | "md" | "lg" };

export type SlideTemplate = {
  width?: number;
  height?: number;
  background: string; // hex (#fff) or css gradient string
  text_color?: string; // default white
  layout?: "centered" | "top-anchor" | "bottom-anchor";
  elements: SlideElement[];
  footer?: string;
  page_index?: number; // for "1/5" indicator
  page_total?: number;
};

const SIZE_MAP: Record<string, number> = { lg: 48, xl: 64, "2xl": 80, "3xl": 110, "4xl": 144 };
const SPACER_MAP: Record<string, number> = { sm: 12, md: 28, lg: 56 };

let cachedFontRegular: ArrayBuffer | null = null;
let cachedFontBold: ArrayBuffer | null = null;

async function loadFont(weight: 400 | 700): Promise<ArrayBuffer> {
  if (weight === 400 && cachedFontRegular) return cachedFontRegular;
  if (weight === 700 && cachedFontBold) return cachedFontBold;
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  if (!cssRes.ok) throw new Error(`google fonts css fetch failed: ${cssRes.status}`);
  const css = await cssRes.text();
  const m = css.match(/url\((https:[^)]+\.(?:woff2|woff|ttf))\)/);
  if (!m) throw new Error("could not parse font url from google fonts css");
  const fontRes = await fetch(m[1]);
  if (!fontRes.ok) throw new Error(`font fetch failed: ${fontRes.status}`);
  const buf = await fontRes.arrayBuffer();
  if (weight === 700) cachedFontBold = buf;
  else cachedFontRegular = buf;
  return buf;
}

function elementToNode(
  el: SlideElement,
  textColor: string,
): Record<string, unknown> | null {
  if (el.type === "spacer") {
    return {
      type: "div",
      props: { style: { height: SPACER_MAP[el.size ?? "md"], width: "100%" } },
    };
  }
  if (el.type === "badge") {
    return {
      type: "div",
      props: {
        style: {
          display: "flex",
          padding: "10px 24px",
          borderRadius: 999,
          background: el.bg ?? "rgba(255,255,255,0.18)",
          color: el.color ?? textColor,
          fontSize: 28,
          fontWeight: 600,
          marginBottom: 16,
          textTransform: "uppercase",
          letterSpacing: 1.5,
        },
        children: el.text,
      },
    };
  }
  if (el.type === "heading") {
    return {
      type: "div",
      props: {
        style: {
          display: "flex",
          fontSize: SIZE_MAP[el.size ?? "3xl"],
          fontWeight: el.weight ?? 700,
          color: el.color ?? textColor,
          lineHeight: 1.05,
          textAlign: el.align ?? "center",
          letterSpacing: -1,
          marginBottom: 12,
        },
        children: el.text,
      },
    };
  }
  if (el.type === "subheading") {
    return {
      type: "div",
      props: {
        style: {
          display: "flex",
          fontSize: 40,
          fontWeight: 600,
          color: el.color ?? textColor,
          lineHeight: 1.25,
          textAlign: el.align ?? "center",
          marginBottom: 8,
        },
        children: el.text,
      },
    };
  }
  if (el.type === "body") {
    return {
      type: "div",
      props: {
        style: {
          display: "flex",
          fontSize: 30,
          fontWeight: 400,
          color: el.color ?? textColor,
          lineHeight: 1.45,
          textAlign: el.align ?? "center",
          opacity: 0.92,
        },
        children: el.text,
      },
    };
  }
  return null;
}

function buildSlideTree(slide: SlideTemplate, w: number, h: number) {
  const textColor = slide.text_color ?? "#FFFFFF";
  const justify =
    slide.layout === "top-anchor"
      ? "flex-start"
      : slide.layout === "bottom-anchor"
        ? "flex-end"
        : "center";
  const children: Record<string, unknown>[] = [];
  for (const el of slide.elements) {
    const n = elementToNode(el, textColor);
    if (n) children.push(n);
  }

  const footerNodes: Record<string, unknown>[] = [];
  if (slide.footer) {
    footerNodes.push({
      type: "div",
      props: {
        style: { fontSize: 22, color: textColor, opacity: 0.65 },
        children: slide.footer,
      },
    });
  }
  if (slide.page_index && slide.page_total) {
    footerNodes.push({
      type: "div",
      props: {
        style: { fontSize: 22, color: textColor, opacity: 0.65 },
        children: `${slide.page_index} / ${slide.page_total}`,
      },
    });
  }

  return {
    type: "div",
    props: {
      style: {
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        background: slide.background,
        padding: 80,
        boxSizing: "border-box",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: justify,
              alignItems: "center",
            },
            children,
          },
        },
        footerNodes.length > 0
          ? {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginTop: 24,
                },
                children: footerNodes,
              },
            }
          : null,
      ].filter(Boolean),
    },
  };
}

export async function renderSlideToPng(slide: SlideTemplate): Promise<Buffer> {
  const w = slide.width ?? 1080;
  const h = slide.height ?? 1080;
  const [regular, bold] = await Promise.all([loadFont(400), loadFont(700)]);

  const node = buildSlideTree(slide, w, h);
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: w,
    height: h,
    fonts: [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: bold, weight: 700, style: "normal" },
    ],
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: w },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

export async function renderCarousel(slides: SlideTemplate[]): Promise<Buffer[]> {
  const total = slides.length;
  return Promise.all(
    slides.map((s, i) =>
      renderSlideToPng({ ...s, page_index: s.page_index ?? i + 1, page_total: s.page_total ?? total }),
    ),
  );
}
