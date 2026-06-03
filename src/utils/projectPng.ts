import type { GridSeed } from "../App";

export type ProjectPngPayload = GridSeed & {
  version: 1 | 2;
  name: string;
  width: number;
  height: number;
  cells: string[];
};

/** Crop rectangle in 0–1 relative coordinates */
export type CropRect = { x: number; y: number; w: number; h: number };

export type ImageImportSettings = {
  width: number;
  height: number;
  detail: number;
  colorCount: number;
  importMode?: "full" | "pattern";
  cropRect?: CropRect; // null / undefined = no crop (use full image)
};

export type ImageImportPreview = {
  seed: GridSeed;
  previewUrl: string;
};

const PNG_SIGNATURE = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
]);
const METADATA_KEYWORD = "beadly-project";
const BASE_COLOR = "#ffffff";
const INACTIVE_CELL_COLOR = "__inactive__";

const WATERMARK_TEXT = "@skapova_studio";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;
const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));
const EXPORT_PADDING = 24;
const EXPORT_DPR = 2;
const MAX_IMPORT_SIZE = 100;
const MIN_IMPORT_DETAIL = 1;
const MAX_IMPORT_DETAIL = 100;
const MIN_IMPORT_COLOR_COUNT = 2;
const MAX_IMPORT_COLOR_COUNT = 48;
const DEFAULT_IMPORT_COLOR_COUNT = 24;
const PREVIEW_MAX_SIZE = 360;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const isLikelyPngFile = (file: File) => {
  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();

  return normalizedType === "image/png" || normalizedName.endsWith(".png");
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const normalizeImportSettings = (settings: ImageImportSettings) => {
  return {
    width: Math.round(clamp(settings.width, 1, MAX_IMPORT_SIZE)),
    height: Math.round(clamp(settings.height, 1, MAX_IMPORT_SIZE)),
    detail: Math.round(
      clamp(settings.detail, MIN_IMPORT_DETAIL, MAX_IMPORT_DETAIL),
    ),
    colorCount: Math.round(
      clamp(
        settings.colorCount,
        MIN_IMPORT_COLOR_COUNT,
        MAX_IMPORT_COLOR_COUNT,
      ),
    ),
    importMode: settings.importMode ?? "full",
    cropRect: settings.cropRect,
  };
};

const isValidPayload = (value: unknown): value is ProjectPngPayload => {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;

  return (
    (payload.version === 1 || payload.version === 2) &&
    typeof payload.name === "string" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number" &&
    Array.isArray(payload.cells) &&
    payload.cells.every((cell) => typeof cell === "string")
  );
};

const normalizeProjectPayloadToSeed = (payload: ProjectPngPayload): GridSeed => {
  const seed: GridSeed = {
    name: payload.name,
    width: payload.width,
    height: payload.height,
    cells: payload.cells,
  };

  if (typeof payload.backgroundColor === "string") {
    seed.backgroundColor = payload.backgroundColor;
  }

  if (typeof payload.backgroundImageUrl === "string" || payload.backgroundImageUrl === null) {
    seed.backgroundImageUrl = payload.backgroundImageUrl;
  }

  if (
    payload.canvasPaddingPercent === 0 ||
    payload.canvasPaddingPercent === 25 ||
    payload.canvasPaddingPercent === 50
  ) {
    seed.canvasPaddingPercent = payload.canvasPaddingPercent;
  }

  if (Array.isArray(payload.textLayers)) {
    seed.textLayers = payload.textLayers;
  }

  if (Array.isArray(payload.shapeLayers)) {
    seed.shapeLayers = payload.shapeLayers;
  }

  if (typeof payload.activeShapeLayerId === "string" || payload.activeShapeLayerId === null) {
    seed.activeShapeLayerId = payload.activeShapeLayerId;
  }

  return seed;
};

const createProjectPngPayload = (project: GridSeed): ProjectPngPayload => {
  const width = Math.max(1, project.width);
  const height = Math.max(1, project.height);
  const cells =
    Array.isArray(project.cells) && project.cells.length === getCellCount(width, height)
      ? project.cells
      : Array.from({ length: getCellCount(width, height) }, () => BASE_COLOR);

  const payload: ProjectPngPayload = {
    version: 2,
    name: project.name.trim() || "beadly-project",
    width,
    height,
    cells,
  };

  if (typeof project.backgroundColor === "string") {
    payload.backgroundColor = project.backgroundColor;
  }

  if (typeof project.backgroundImageUrl === "string" || project.backgroundImageUrl === null) {
    payload.backgroundImageUrl = project.backgroundImageUrl;
  }

  if (
    project.canvasPaddingPercent === 0 ||
    project.canvasPaddingPercent === 25 ||
    project.canvasPaddingPercent === 50
  ) {
    payload.canvasPaddingPercent = project.canvasPaddingPercent;
  }

  if (Array.isArray(project.textLayers)) {
    payload.textLayers = project.textLayers;
  }

  if (Array.isArray(project.shapeLayers)) {
    payload.shapeLayers = project.shapeLayers;
  }

  if (typeof project.activeShapeLayerId === "string" || project.activeShapeLayerId === null) {
    payload.activeShapeLayerId = project.activeShapeLayerId;
  }

  return payload;
};

const getCellCount = (width: number, height: number) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const rowCount = safeHeight * 2 + 1;

  let total = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    total += rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  }

  return total;
};

const sanitizeFileName = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");

  return normalized || "beadly-project";
};

const stripExtension = (name: string) => {
  return name.replace(/\.[^.]+$/, "");
};

const imageCache = new WeakMap<File, Promise<HTMLImageElement>>();

/**
 * Кэшируем декодирование изображения на время жизни File.
 * ImportImageSheet сначала считает дефолтные настройки, потом несколько раз
 * строит превью, поэтому без кэша один и тот же файл декодировался повторно.
 */
const loadImageFromFile = (file: File) => {
  const cachedImage = imageCache.get(file);
  if (cachedImage) {
    return cachedImage;
  }

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось загрузить изображение"));
    };

    image.src = objectUrl;
  });

  imageCache.set(file, imagePromise);
  return imagePromise;
};

const rgbToHex = (red: number, green: number, blue: number) => {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
};


/* ── HSL helpers ─────────────────────────────────────────────────────────── */

const rgbToHsl = (
  r: number, g: number, b: number,
): { h: number; s: number; l: number } => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
};

const hslToRgb = (
  h: number, s: number, l: number,
): { r: number; g: number; b: number } => {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
};

/**
 * Boosts saturation and contrast of cell colors.
 * Makes the result vivid and pleasing instead of flat/washed-out.
 * satFactor > 1 = more vivid; lightnessFactor > 1 = higher contrast.
 */
const getColorDistance = (
  first: { red: number; green: number; blue: number },
  second: { red: number; green: number; blue: number },
) => {
  const redDiff = first.red - second.red;
  const greenDiff = first.green - second.green;
  const blueDiff = first.blue - second.blue;

  // Perceptual weights: human eye is most sensitive to green, then red, then blue
  return 2 * redDiff * redDiff + 4 * greenDiff * greenDiff + 3 * blueDiff * blueDiff;
};

/**
 * Spatial smoothing pass on the hex grid.
 * Replaces isolated "noise" cells (surrounded by a dominant different color)
 * with the majority neighbor color. Makes color regions coherent and the
 * design readable — the same visual clarity you get with fewer colors,
 * but preserving the full palette.
 *
 * Hex adjacency:
 *   Even row cell (r, c): cross-row neighbors at (r±1, c) and (r±1, c+1)
 *   Odd  row cell (r, c): cross-row neighbors at (r±1, c-1) and (r±1, c)
 */
const smoothCellColors = (
  cells: string[],
  width: number,
  height: number,
  passes: number = 2,
  /** 0 = remove only fully isolated cells; 1 = also remove cells with ≤1 same-color neighbor (more aggressive) */
  isolationThreshold: number = 0,
): string[] => {
  const rowCount = height * 2 + 1;

  // Precompute row starts and lengths
  const rowStart = new Array<number>(rowCount);
  const rowLen = new Array<number>(rowCount);
  let offset = 0;
  for (let r = 0; r < rowCount; r++) {
    rowStart[r] = offset;
    rowLen[r] = r % 2 === 0 ? width : width + 1;
    offset += rowLen[r];
  }

  let current = cells.slice();

  for (let pass = 0; pass < passes; pass++) {
    const next = current.slice();

    for (let r = 0; r < rowCount; r++) {
      const isEven = r % 2 === 0;
      const len = rowLen[r];

      for (let c = 0; c < len; c++) {
        const ci = rowStart[r] + c;
        const cellColor = current[ci];
        if (cellColor === INACTIVE_CELL_COLOR) continue;

        // Collect neighbor colors
        const neighborColors: string[] = [];

        // Same-row neighbors
        if (c > 0) neighborColors.push(current[rowStart[r] + c - 1]);
        if (c < len - 1) neighborColors.push(current[rowStart[r] + c + 1]);

        // Cross-row neighbors (hex layout)
        for (const adjR of [r - 1, r + 1]) {
          if (adjR < 0 || adjR >= rowCount) continue;
          const adjLen = rowLen[adjR];
          // Even row's cross neighbors are in an odd (longer) row → c and c+1
          // Odd  row's cross neighbors are in an even (shorter) row → c-1 and c
          const n1 = isEven ? c : c - 1;
          const n2 = isEven ? c + 1 : c;
          if (n1 >= 0 && n1 < adjLen) neighborColors.push(current[rowStart[adjR] + n1]);
          if (n2 >= 0 && n2 < adjLen) neighborColors.push(current[rowStart[adjR] + n2]);
        }

        // Frequency of each color among neighbors (not counting self)
        const freq = new Map<string, number>();
        for (const nc of neighborColors) {
          if (nc !== INACTIVE_CELL_COLOR) freq.set(nc, (freq.get(nc) ?? 0) + 1);
        }

        // How many neighbors share this cell's own color
        const selfFreqInNeighbors = freq.get(cellColor) ?? 0;

        // Find dominant neighbor color
        let maxFreq = 0;
        let maxColor = cellColor;
        freq.forEach((cnt, color) => {
          if (cnt > maxFreq) { maxFreq = cnt; maxColor = color; }
        });

        // Replace only truly isolated cells: cell color appears nowhere in
        // neighbors AND majority neighbor color is dominant (relative threshold
        // adapts to actual neighbor count — handles edge/corner cells correctly).
        const dominanceThreshold = Math.max(2, Math.ceil(neighborColors.length * 0.5));
        if (selfFreqInNeighbors <= isolationThreshold && maxFreq >= dominanceThreshold && maxColor !== cellColor) {
          next[ci] = maxColor;
        }
      }
    }

    current = next;
  }

  return current;
};

/**
 * Builds a color palette using Median Cut algorithm.
 * Guarantees even coverage across the full color space — no color region
 * gets over-represented, unlike pure frequency-based approaches.
 */
const buildMedianCutPalette = (
  colors: Array<{ red: number; green: number; blue: number }>,
  targetCount: number,
): Array<{ color: string; red: number; green: number; blue: number }> => {
  if (colors.length === 0) return [];

  type Box = Array<{ red: number; green: number; blue: number }>;

  const splitBox = (box: Box): [Box, Box] => {
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const c of box) {
      if (c.red   < minR) minR = c.red;   if (c.red   > maxR) maxR = c.red;
      if (c.green < minG) minG = c.green; if (c.green > maxG) maxG = c.green;
      if (c.blue  < minB) minB = c.blue;  if (c.blue  > maxB) maxB = c.blue;
    }
    const rR = maxR - minR, rG = maxG - minG, rB = maxB - minB;
    // Weight channels by perceptual importance for better splits
    const axis: "red" | "green" | "blue" =
      rG * 4 >= rR * 2 && rG * 4 >= rB * 3 ? "green" :
      rR * 2 >= rB * 3 ? "red" : "blue";
    const sorted = [...box].sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(sorted.length / 2);
    return [sorted.slice(0, mid), sorted.slice(mid)];
  };

  const avgColor = (box: Box) => {
    let sr = 0, sg = 0, sb = 0;
    for (const c of box) { sr += c.red; sg += c.green; sb += c.blue; }
    const n = box.length;
    const red = sr / n, green = sg / n, blue = sb / n;
    return { color: normalizeImportedColor(rgbToHex(red, green, blue)), red, green, blue };
  };

  let boxes: Box[] = [colors];

  while (boxes.length < targetCount) {
    // Split the largest box (most colors = most variation)
    let maxIdx = 0;
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i].length > boxes[maxIdx].length) maxIdx = i;
    }
    if (boxes[maxIdx].length <= 1) break;
    const [a, b] = splitBox(boxes[maxIdx]);
    boxes.splice(maxIdx, 1, a, b);
  }

  return boxes.filter((b) => b.length > 0).map(avgColor);
};


const isInactiveCell = (color: string) => color === INACTIVE_CELL_COLOR;

const isAlmostWhite = (red: number, green: number, blue: number) => {
  return red >= 248 && green >= 248 && blue >= 248;
};

const normalizeImportedColor = (
  color: string,
  options?: { blankWhiteAsInactive?: boolean },
) => {
  const normalized = color.toLowerCase();

  if (options?.blankWhiteAsInactive && normalized === BASE_COLOR) {
    return INACTIVE_CELL_COLOR;
  }

  if (
    normalized === "#f4f5f7" ||
    normalized === "#f5f5f7" ||
    normalized === "#f4f4f6" ||
    normalized === "#f3f4f6"
  ) {
    return BASE_COLOR;
  }

  return normalized;
};

const getFallbackImportSizeFromImage = (image: HTMLImageElement) => {
  const rawWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const rawHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const scale = Math.min(
    MAX_IMPORT_SIZE / rawWidth,
    MAX_IMPORT_SIZE / rawHeight,
    1,
  );

  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
  };
};
const getImageProcessingSize = (
  rawWidth: number,
  rawHeight: number,
  gridWidth: number,
  gridHeight: number,
  detail: number,
) => {
  const gridDensity = Math.max(gridWidth + 1, gridHeight * 2 + 1);
  const detailScale = clamp(detail / MAX_IMPORT_DETAIL, 0.1, 1);
  const maxSide = clamp(
    Math.round(gridDensity * (4 + detailScale * 8)),
    180,
    1200,
  );
  const scale = Math.min(maxSide / rawWidth, maxSide / rawHeight, 1);

  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
  };
};


const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }

    table[n] = c >>> 0;
  }

  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const readUint32 = (bytes: Uint8Array, offset: number) => {
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
};

const writeUint32 = (value: number) => {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
};

const concatBytes = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);

  let offset = 0;

  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });

  return result;
};

const createChunk = (type: string, data: Uint8Array) => {
  const typeBytes = encoder.encode(type);
  const crcBytes = concatBytes(typeBytes, data);
  const crc = writeUint32(crc32(crcBytes));

  return concatBytes(writeUint32(data.length), typeBytes, data, crc);
};

const areBytesEqual = (first: Uint8Array, second: Uint8Array) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
};

const insertMetadataChunk = (
  pngBytes: Uint8Array,
  payload: ProjectPngPayload,
) => {
  const keywordBytes = encoder.encode(METADATA_KEYWORD);
  const textBytes = encoder.encode(JSON.stringify(payload));
  const chunkData = concatBytes(keywordBytes, new Uint8Array([0]), textBytes);
  const metadataChunk = createChunk("tEXt", chunkData);

  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= pngBytes.length) {
    const length = readUint32(pngBytes, offset);
    const typeStart = offset + 4;
    const type = decoder.decode(pngBytes.slice(typeStart, typeStart + 4));
    const chunkEnd = offset + 12 + length;

    if (type === "IEND") {
      return concatBytes(
        pngBytes.slice(0, offset),
        metadataChunk,
        pngBytes.slice(offset),
      );
    }

    offset = chunkEnd;
  }

  return pngBytes;
};

const readMetadataChunk = (pngBytes: Uint8Array) => {
  const signature = pngBytes.slice(0, PNG_SIGNATURE.length);

  if (!areBytesEqual(signature, PNG_SIGNATURE)) {
    return null;
  }

  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= pngBytes.length) {
    const length = readUint32(pngBytes, offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const type = decoder.decode(pngBytes.slice(typeStart, typeStart + 4));

    if (dataEnd + 4 > pngBytes.length) {
      return null;
    }

    if (type === "tEXt") {
      const data = pngBytes.slice(dataStart, dataEnd);
      const separatorIndex = data.indexOf(0);

      if (separatorIndex !== -1) {
        const keyword = decoder.decode(data.slice(0, separatorIndex));

        if (keyword === METADATA_KEYWORD) {
          try {
            const json = decoder.decode(data.slice(separatorIndex + 1));
            const parsed: unknown = JSON.parse(json);
            return isValidPayload(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }
      }
    }

    offset = dataEnd + 4;
  }

  return null;
};

const canvasToPngBytes = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Не удалось создать PNG"));
      }
    }, "image/png");
  });

  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
};

const tryShareBlob = async (blob: Blob, fileName: string) => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  const file = new File([blob], fileName, { type: "image/png" });

  // Attempt 1: share as file (works on iOS, some Android)
  const fileShareData: ShareData = { files: [file] };
  const canShareFiles =
    typeof navigator.canShare !== "function" || navigator.canShare(fileShareData);

  if (canShareFiles) {
    try {
      await navigator.share(fileShareData);
      return true;
    } catch (err) {
      // AbortError means user dismissed — that's fine, still "handled"
      if (err instanceof Error && err.name === "AbortError") return true;
      // Otherwise fall through to next attempt
    }
  }

  // Attempt 2: open blob URL so user can long-press Save Image
  try {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
};

/**
 * Draws a repeating diagonal watermark across the entire canvas.
 * Pattern: "Skapova Studio" tiled at 45° with shadow — same style as the PDF example.
 * Uses setTransform(identity) so it always works regardless of prior context.scale().
 *
 * Exported so CanvasGrid can use it when generating the PNG preview image too.
 */
export const drawWatermark = (
  context: CanvasRenderingContext2D,
  pixelWidth: number,
  pixelHeight: number,
  text?: string,
) => {
  const watermarkText = (text && text.trim()) ? text.trim() : WATERMARK_TEXT;
  const fontSize = Math.max(16, Math.round(Math.min(pixelWidth, pixelHeight) * 0.055));
  const stepX = fontSize * 7;
  const stepY = fontSize * 5;
  const angleRad = (45 * Math.PI) / 180;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.font = `italic 700 ${fontSize}px Georgia, "Times New Roman", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const diagonal = Math.ceil(Math.sqrt(pixelWidth * pixelWidth + pixelHeight * pixelHeight));
  const stepsX = Math.ceil(diagonal / stepX) + 2;
  const stepsY = Math.ceil(diagonal / stepY) + 2;
  const cx = pixelWidth / 2;
  const cy = pixelHeight / 2;

  for (let ix = -stepsX; ix <= stepsX; ix++) {
    for (let iy = -stepsY; iy <= stepsY; iy++) {
      const x = cx + ix * stepX;
      const y = cy + iy * stepY;

      context.save();
      context.translate(x, y);
      context.rotate(angleRad);

      // Белая обводка — виден на тёмном фоне
      context.strokeStyle = "rgba(255,255,255,0.55)";
      context.lineWidth = Math.max(2, fontSize * 0.12);
      context.strokeText(watermarkText, 0, 0);

      // Тёмный текст — виден на светлом фоне
      context.fillStyle = "rgba(0,0,0,0.38)";
      context.fillText(watermarkText, 0, 0);

      context.restore();
    }
  }

  context.restore();
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

const deliverBytes = async (bytes: Uint8Array, fileName: string) => {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  const safeName = `${sanitizeFileName(fileName)}.png`;
  const blob = new Blob([arrayBuffer], { type: "image/png" });

  const shared = await tryShareBlob(blob, safeName);
  if (shared) return;

  downloadBlob(blob, safeName);
};


const sampleCellsFromImage = (
  image: HTMLImageElement,
  width: number,
  height: number,
  options?: {
    blankWhiteAsInactive?: boolean;
    detail?: number;
    colorCount?: number;
    sourceMode?: "beadly-export" | "image";
    importMode?: "full" | "pattern";
    cropRect?: CropRect;
  },
) => {
  const rowCount = height * 2 + 1;
  const maxRowLength = width + 1;
  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const rawWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const rawHeight = Math.max(1, image.naturalHeight || image.height || 1);

  const totalLogicalWidth = boardWidth + EXPORT_PADDING * 2;
  const totalLogicalHeight = boardHeight + EXPORT_PADDING * 2;
  const exportScaleX = rawWidth / totalLogicalWidth;
  const exportScaleY = rawHeight / totalLogicalHeight;
  const sourceMode = options?.sourceMode ?? "beadly-export";
  const detail = Math.round(
    clamp(options?.detail ?? MAX_IMPORT_DETAIL, MIN_IMPORT_DETAIL, MAX_IMPORT_DETAIL),
  );
  const colorCount = Math.round(
    clamp(
      options?.colorCount ?? DEFAULT_IMPORT_COLOR_COUNT,
      MIN_IMPORT_COLOR_COUNT,
      MAX_IMPORT_COLOR_COUNT,
    ),
  );

  const processingSize =
    sourceMode === "image"
      ? getImageProcessingSize(rawWidth, rawHeight, width, height, detail)
      : { width: rawWidth, height: rawHeight };

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = processingSize.width;
  sampleCanvas.height = processingSize.height;

  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Не удалось подготовить изображение");
  }

  /*
    Важно: сначала заливаем canvas белым.
    У PNG/WebP с прозрачностью иначе браузер может дать чёрные пиксели,
    из-за чего обычная картинка импортировалась почти полностью чёрной.
  */
  context.fillStyle = BASE_COLOR;
  context.fillRect(0, 0, processingSize.width, processingSize.height);
  context.imageSmoothingEnabled = true;

  if ("imageSmoothingQuality" in context) {
    context.imageSmoothingQuality = "high";
  }

  // Apply user crop: convert 0–1 rect to actual source pixel coordinates.
  // All subsequent drawImage calls use these instead of (0, 0, rawW, rawH).
  const crop = options?.cropRect;
  const srcCropX = crop ? Math.round(clamp(crop.x, 0, 1) * rawWidth)  : 0;
  const srcCropY = crop ? Math.round(clamp(crop.y, 0, 1) * rawHeight) : 0;
  const srcCropW = crop ? Math.max(1, Math.round(clamp(crop.w, 0.01, 1) * rawWidth))  : rawWidth;
  const srcCropH = crop ? Math.max(1, Math.round(clamp(crop.h, 0.01, 1) * rawHeight)) : rawHeight;

  if (options?.importMode === "pattern" && sourceMode === "image") {
    // Pattern mode: center-crop the image to exactly match the grid's visual
    // aspect ratio, then scale to fill. This makes the pattern fill the grid
    // as one unified element without distortion or empty borders.
    //
    // The bead grid is NOT a square pixel grid — it has its own visual proportions
    // determined by xStep and yStep. We must respect this to avoid the "crooked" look.
    // Pattern mode: center-crop to grid's visual aspect ratio using the (already user-cropped) area
    const gridVisualW = (width + 1) * xStep;
    const gridVisualH = (height * 2 + 1) * yStep;
    const gridAspect = gridVisualW / gridVisualH;
    const cropAspect = srcCropW / srcCropH;

    let sx = srcCropX, sy = srcCropY, sw = srcCropW, sh = srcCropH;
    if (cropAspect > gridAspect) {
      sw = Math.round(srcCropH * gridAspect);
      sx = srcCropX + Math.round((srcCropW - sw) / 2);
    } else {
      sh = Math.round(srcCropW / gridAspect);
      sy = srcCropY + Math.round((srcCropH - sh) / 2);
    }

    context.drawImage(image, sx, sy, sw, sh, 0, 0, processingSize.width, processingSize.height);
  } else {
    // Full mode: draw the user-cropped area scaled to fill the processing canvas
    context.drawImage(image, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, processingSize.width, processingSize.height);
  }

  const cells: string[] = [];

  if (sourceMode === "image") {
    // ── New pipeline: pre-quantize canvas → sample cells ──────────────────
    //
    // Instead of sampling raw colors per-cell and then doing palette reduction
    // (which creates muddy averages), we:
    //   1. Boost saturation + contrast on ALL canvas pixels
    //   2. Build palette via Median Cut from the full pixel set
    //   3. Remap ALL pixels to the palette using an O(1) LUT
    //   4. Sample each cell by picking the most frequent palette color in its region
    //
    // Result: every pixel is already a palette color before sampling, so cells
    // get clean, vibrant colors with sharp edges between regions.

    const detailScale = detail / MAX_IMPORT_DETAIL;
    const satBoost = 1.15 + (1 - detailScale) * 0.25;      // 1.15–1.40
    const contrastBoost = 1.08 + (1 - detailScale) * 0.12;  // 1.08–1.20

    // Step 0 — pre-blur via downsample → upsample (browser handles it natively).
    // Smooths out color noise BEFORE quantization so palette and cell colors are cleaner.
    // Blur is proportional to (1 - detailScale): at detail=100% no blur, at detail=50% strong blur.
    // Cell pixel size tells us how much we can blur without bleeding across cells.
    const cellPixelW = processingSize.width  / (width + 1);
    const cellPixelH = processingSize.height / (height * 2 + 1);
    const cellPx = Math.min(cellPixelW, cellPixelH);
    // blurFactor 0..1: how many "cell sizes" to blur. Capped so we never blur > 40% of a cell.
    const blurFactor = (1 - detailScale) * 0.4;
    const blurDivisor = Math.max(1, cellPx * blurFactor);

    if (blurDivisor > 1.5) {
      const bw = Math.max(4, Math.round(processingSize.width  / blurDivisor));
      const bh = Math.max(4, Math.round(processingSize.height / blurDivisor));
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width  = bw;
      blurCanvas.height = bh;
      const bCtx = blurCanvas.getContext("2d");
      if (bCtx) {
        bCtx.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in bCtx) bCtx.imageSmoothingQuality = "high" as ImageSmoothingQuality;
        // Shrink → expand: natural box-blur by the browser
        bCtx.drawImage(context.canvas, 0, 0, bw, bh);
        context.fillStyle = BASE_COLOR;
        context.fillRect(0, 0, processingSize.width, processingSize.height);
        context.drawImage(blurCanvas, 0, 0, processingSize.width, processingSize.height);
      }
    }

    // Step 1 — read & boost canvas pixels in-place
    const ppData = context.getImageData(0, 0, processingSize.width, processingSize.height);
    const pp = ppData.data;
    for (let i = 0; i < pp.length; i += 4) {
      if (pp[i + 3] < 16) continue;
      const rc = clamp(Math.round(128 + (pp[i]   - 128) * contrastBoost), 0, 255);
      const gc = clamp(Math.round(128 + (pp[i+1] - 128) * contrastBoost), 0, 255);
      const bc = clamp(Math.round(128 + (pp[i+2] - 128) * contrastBoost), 0, 255);
      const { h, s, l } = rgbToHsl(rc, gc, bc);
      const { r: fr, g: fg, b: fb } = hslToRgb(h, clamp(s * satBoost, 0, 1), l);
      pp[i] = fr; pp[i + 1] = fg; pp[i + 2] = fb;
    }

    // Step 2 — build palette from sampled pixels (target ~8000 samples for speed)
    const totalPx = processingSize.width * processingSize.height;
    const sampleEvery = Math.max(1, Math.floor(totalPx / 8000));
    const paletteInput: Array<{ red: number; green: number; blue: number }> = [];
    for (let i = 0; i < pp.length; i += 4 * sampleEvery) {
      if (pp[i + 3] > 16) paletteInput.push({ red: pp[i], green: pp[i + 1], blue: pp[i + 2] });
    }
    const palette = buildMedianCutPalette(paletteInput, colorCount);
    // Guard: if image is blank/fully transparent, fill with base color
    if (palette.length === 0) {
      const total = rowCount * (width + 1);
      return Array(total).fill(BASE_COLOR);
    }

    // Step 3 — build LUT: 32×32×32 buckets (8 per channel) → palette index
    const LS = 32;
    const lut = new Uint8Array(LS * LS * LS);
    for (let ri = 0; ri < LS; ri++) {
      for (let gi = 0; gi < LS; gi++) {
        for (let bi = 0; bi < LS; bi++) {
          const r = ri * 8 + 4, g = gi * 8 + 4, b = bi * 8 + 4;
          let best = 0, bestDist = Infinity;
          for (let pi = 0; pi < palette.length; pi++) {
            const d = getColorDistance({ red: r, green: g, blue: b }, palette[pi]);
            if (d < bestDist) { bestDist = d; best = pi; }
          }
          lut[ri * LS * LS + gi * LS + bi] = best;
        }
      }
    }

    // Step 4 — remap all canvas pixels to palette (O(1) per pixel via LUT)
    for (let i = 0; i < pp.length; i += 4) {
      if (pp[i + 3] < 16) continue;
      const pi = lut[(pp[i] >> 3) * LS * LS + (pp[i + 1] >> 3) * LS + (pp[i + 2] >> 3)];
      pp[i]     = Math.round(palette[pi].red);
      pp[i + 1] = Math.round(palette[pi].green);
      pp[i + 2] = Math.round(palette[pi].blue);
    }
    context.putImageData(ppData, 0, 0);

    // Step 5 — re-read quantized pixels and pre-build hex strings for palette
    // Re-use pp directly — no need to re-read from canvas (avoids Safari premultiplied-alpha issues)
    const imageData2 = pp;
    const paletteHex = palette.map((p) => normalizeImportedColor(rgbToHex(p.red, p.green, p.blue)));
    const counts = new Int32Array(palette.length);

    // Step 6 — sample each bead cell: pick most frequent palette color in its region
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowLength = rowIndex % 2 === 0 ? width : width + 1;
      const startY = Math.floor((rowIndex / rowCount) * processingSize.height);
      const endY = Math.max(startY + 1, Math.floor(((rowIndex + 1) / rowCount) * processingSize.height));

      for (let colIndex = 0; colIndex < rowLength; colIndex += 1) {
        const startX = Math.floor((colIndex / rowLength) * processingSize.width);
        const endX = Math.max(startX + 1, Math.floor(((colIndex + 1) / rowLength) * processingSize.width));

        counts.fill(0);
        let total = 0;

        for (let sy = startY; sy < Math.min(endY, processingSize.height); sy++) {
          for (let sx = startX; sx < Math.min(endX, processingSize.width); sx++) {
            const idx = (sy * processingSize.width + sx) * 4;
            if (imageData2[idx + 3] < 16) continue;
            counts[lut[(imageData2[idx] >> 3) * LS * LS + (imageData2[idx + 1] >> 3) * LS + (imageData2[idx + 2] >> 3)]]++;
            total++;
          }
        }

        if (total === 0) {
          cells.push(BASE_COLOR);
        } else {
          let bestPi = 0;
          for (let pi = 1; pi < counts.length; pi++) {
            if (counts[pi] > counts[bestPi]) bestPi = pi;
          }
          cells.push(paletteHex[bestPi]);
        }
      }
    }

    // Step 7 — spatial smoothing: more aggressive for small grids
    const cellArea = width * height;
    // Small grids need extra passes and a lower dominance threshold
    // (replace cells that appear in only 1 neighbor, not just 0)
    const smoothPasses = cellArea < 200 ? 4 : cellArea < 600 ? 3 : cellArea < 1500 ? 2 : 1;
    const smoothThreshold = cellArea < 600 ? 1 : 0; // 1 = also merge 2-cell islands
    return smoothCellColors(cells, width, height, smoothPasses, smoothThreshold);
  }

  const imageData = context.getImageData(0, 0, processingSize.width, processingSize.height).data;


  const sampleRadius = 1;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowLength = rowIndex % 2 === 0 ? width : width + 1;
    const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

    for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
      const logicalCenterX =
        EXPORT_PADDING + rowStartX + columnIndex * xStep + bead / 2;
      const logicalCenterY = EXPORT_PADDING + rowIndex * yStep + bead / 2;

      const pixelX = clamp(
        Math.round(logicalCenterX * exportScaleX),
        0,
        rawWidth - 1,
      );
      const pixelY = clamp(
        Math.round(logicalCenterY * exportScaleY),
        0,
        rawHeight - 1,
      );

      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let offsetY = -sampleRadius; offsetY <= sampleRadius; offsetY += 1) {
        for (let offsetX = -sampleRadius; offsetX <= sampleRadius; offsetX += 1) {
          const sampleX = clamp(pixelX + offsetX, 0, rawWidth - 1);
          const sampleY = clamp(pixelY + offsetY, 0, rawHeight - 1);
          const index = (sampleY * rawWidth + sampleX) * 4;
          const alpha = imageData[index + 3];

          if (alpha < 16) continue;

          red += imageData[index];
          green += imageData[index + 1];
          blue += imageData[index + 2];
          count += 1;
        }
      }

      if (count === 0) {
        cells.push(options?.blankWhiteAsInactive ? INACTIVE_CELL_COLOR : BASE_COLOR);
      } else {
        const averageRed = red / count;
        const averageGreen = green / count;
        const averageBlue = blue / count;

        if (
          options?.blankWhiteAsInactive &&
          isAlmostWhite(averageRed, averageGreen, averageBlue)
        ) {
          cells.push(INACTIVE_CELL_COLOR);
        } else {
          cells.push(
            normalizeImportedColor(
              rgbToHex(averageRed, averageGreen, averageBlue),
              options,
            ),
          );
        }
      }
    }
  }

  return cells;
};

const createPreviewUrlFromSeed = (seed: GridSeed) => {
  const width = Math.max(1, seed.width);
  const height = Math.max(1, seed.height);
  const rowCount = height * 2 + 1;
  const maxRowLength = width + 1;
  const previewBead = Math.max(2, Math.min(9, Math.floor(280 / maxRowLength)));
  const previewXStep = previewBead * 0.86;
  const previewYStep = previewBead * 0.74;
  const boardWidth = (maxRowLength - 1) * previewXStep + previewBead;
  const boardHeight = (rowCount - 1) * previewYStep + previewBead;
  const scale = Math.min(
    PREVIEW_MAX_SIZE / boardWidth,
    PREVIEW_MAX_SIZE / boardHeight,
    1,
  );
  const canvas = document.createElement("canvas");
  const padding = 16;
  const canvasWidth = Math.max(1, Math.round(boardWidth * scale + padding * 2));
  const canvasHeight = Math.max(1, Math.round(boardHeight * scale + padding * 2));

  canvas.width = canvasWidth * 2;
  canvas.height = canvasHeight * 2;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить превью");
  }

  context.scale(2, 2);
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "rgba(255,255,255,0.04)";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const cells = Array.isArray(seed.cells) ? seed.cells : [];
  let cellIndex = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowLength = rowIndex % 2 === 0 ? width : width + 1;
    const rowStartX = rowLength === maxRowLength ? 0 : previewXStep / 2;

    for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
      const color = cells[cellIndex] ?? BASE_COLOR;

      if (!isInactiveCell(color)) {
        const centerX = padding + (rowStartX + columnIndex * previewXStep) * scale;
        const centerY = padding + rowIndex * previewYStep * scale;
        const radius = Math.max(1.2, (previewBead * scale) / 2);

        context.beginPath();
        context.arc(centerX + radius, centerY + radius, radius, 0, Math.PI * 2);
        context.fillStyle = color === BASE_COLOR ? "#f4f5f7" : color;
        context.fill();
      }

      cellIndex += 1;
    }
  }

  return canvas.toDataURL("image/png");
};

export const exportProjectToPng = async (
  project: GridSeed,
  options?: { watermark?: boolean },
) => {
  const width = Math.max(1, project.width);
  const height = Math.max(1, project.height);
  const rowCount = height * 2 + 1;
  const maxRowLength = width + 1;
  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const cells =
    Array.isArray(project.cells) &&
    project.cells.length === getCellCount(width, height)
      ? project.cells
      : Array.from({ length: getCellCount(width, height) }, () => BASE_COLOR);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(
    1,
    Math.round((boardWidth + EXPORT_PADDING * 2) * EXPORT_DPR),
  );
  canvas.height = Math.max(
    1,
    Math.round((boardHeight + EXPORT_PADDING * 2) * EXPORT_DPR),
  );

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить PNG");
  }

  context.scale(EXPORT_DPR, EXPORT_DPR);
  context.fillStyle = "#ffffff";
  context.fillRect(
    0,
    0,
    boardWidth + EXPORT_PADDING * 2,
    boardHeight + EXPORT_PADDING * 2,
  );

  let cellIndex = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowLength = rowIndex % 2 === 0 ? width : width + 1;
    const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

    for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
      const color = cells[cellIndex] ?? BASE_COLOR;

      if (isInactiveCell(color)) {
        cellIndex += 1;
        continue;
      }

      const left = EXPORT_PADDING + rowStartX + columnIndex * xStep;
      const top = EXPORT_PADDING + rowIndex * yStep;
      const radius = bead / 2;

      context.beginPath();
      context.arc(left + radius, top + radius, radius, 0, Math.PI * 2);
      context.fillStyle = color === BASE_COLOR ? "#f4f5f7" : color;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle =
        color === BASE_COLOR ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.18)";
      context.stroke();

      cellIndex += 1;
    }
  }

  // Watermark поверх бусин — всегда виден
  if (options?.watermark) {
    drawWatermark(context, canvas.width, canvas.height);
  }

  const payload = createProjectPngPayload({
    ...project,
    width,
    height,
    cells,
  });

  const rawPng = await canvasToPngBytes(canvas);
  const pngWithMetadata = insertMetadataChunk(rawPng, payload);
  await deliverBytes(pngWithMetadata, project.name);
};

export const exportCanvasProjectToPng = async (
  canvas: HTMLCanvasElement,
  project: GridSeed,
  fileName?: string,
) => {
  const exportName = (fileName ?? project.name).trim() || "beadly-project";

  const payload = createProjectPngPayload({
    ...project,
    name: exportName,
  });
  const rawPng = await canvasToPngBytes(canvas);
  const pngWithMetadata = insertMetadataChunk(rawPng, payload);

  await deliverBytes(pngWithMetadata, exportName);
};

export const parseProjectPng = async (
  file: File,
): Promise<GridSeed | null> => {
  if (!isLikelyPngFile(file)) return null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const payload = readMetadataChunk(bytes);

  if (!payload) return null;

  return normalizeProjectPayloadToSeed(payload);
};

export const tryImportProjectPng = async (
  file: File,
): Promise<GridSeed | null> => {
  /*
    Импорт "как проект" разрешаем только для PNG с нашей metadata.
    Обычные картинки нельзя распознавать по размеру как старый экспорт:
    из-за ложного совпадения они могли открываться сразу в редакторе и
    превращаться в чёрную сетку без окна настройки детализации/цветов.
  */
  return parseProjectPng(file);
};

/**
 * Returns sensible defaults scaled to the grid size:
 * - small grids get fewer colors and lower detail (more averaging → cleaner look)
 * - large grids get more colors and higher detail
 */
const getAdaptiveDefaults = (width: number, height: number) => {
  const cellArea = width * height;
  // Color count: sqrt-scale from 8 (tiny) to 36 (large), clamped
  const colorCount = clamp(
    Math.round(Math.sqrt(cellArea) * 0.55),
    MIN_IMPORT_COLOR_COUNT,
    MAX_IMPORT_COLOR_COUNT,
  );
  // Detail: smaller grids benefit from more averaging (lower detail)
  const detail = cellArea < 200 ? 50 : cellArea < 600 ? 60 : 70;
  return { colorCount, detail };
};

export const getDefaultImageImportSettings = async (
  file: File,
): Promise<ImageImportSettings> => {
  const image = await loadImageFromFile(file);
  const size = getFallbackImportSizeFromImage(image);
  const { colorCount, detail } = getAdaptiveDefaults(size.width, size.height);

  return {
    width: size.width,
    height: size.height,
    detail,
    colorCount,
  };
};

export const importImageToGridSeed = async (
  file: File,
  settings?: ImageImportSettings,
): Promise<GridSeed> => {
  if (!settings) {
    const projectPng = await tryImportProjectPng(file);
    if (projectPng) {
      return projectPng;
    }
  }

  const image = await loadImageFromFile(file);
  const normalizedSettings = settings
    ? normalizeImportSettings(settings)
    : normalizeImportSettings({
        ...(({ width, height }) => ({ width, height, ...getAdaptiveDefaults(width, height) }))(getFallbackImportSizeFromImage(image)),
      });
  const cells = sampleCellsFromImage(
    image,
    normalizedSettings.width,
    normalizedSettings.height,
    {
      detail: normalizedSettings.detail,
      colorCount: normalizedSettings.colorCount,
      sourceMode: "image",
      importMode: normalizedSettings.importMode ?? "full",
      cropRect: normalizedSettings.cropRect,
    },
  );

  return {
    name: stripExtension(file.name) || "Импорт изображения",
    width: normalizedSettings.width,
    height: normalizedSettings.height,
    cells,
  };
};

export const createImageImportPreview = async (
  file: File,
  settings: ImageImportSettings,
): Promise<ImageImportPreview> => {
  const seed = await importImageToGridSeed(file, settings);
  return {
    seed,
    previewUrl: createPreviewUrlFromSeed(seed),
  };
};
