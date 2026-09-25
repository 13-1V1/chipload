// Deterministic resized assets from the established logo; no production dependency.
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("assets/brand-source.png", root));
await mkdir(new URL("assets/icons/", root), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [name, size, maskable] of [["favicon.png",32], ["assets/icons/brand-96.png",96], ["assets/icons/brand-192.png",192], ["assets/icons/apple-touch-180.png",180], ["assets/icons/app-192.png",192], ["assets/icons/app-512.png",512], ["assets/icons/maskable-512.png",512,true]]) {
    const data = await page.evaluate(async ({src,size,maskable}) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#081a33";
      ctx.fillRect(0,0,size,size);
      // A centered square 56% wide fits fully inside the maskable 80% safe circle.
      const side = maskable ? Math.floor(size * 0.56) : size;
      const offset = (size - side) / 2;
      ctx.drawImage(image, offset, offset, side, side);
      return canvas.toDataURL("image/png").split(",")[1];
    }, {src:`data:image/png;base64,${source.toString("base64")}`,size,maskable:Boolean(maskable)});
    await writeFile(new URL(name, root), Buffer.from(data,"base64"));
  }
} finally { await browser.close(); }
