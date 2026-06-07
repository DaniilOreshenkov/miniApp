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
  patternRepeat?: number;
  /** "photo" = gentle photo processing; "pattern" = sharp geometric processing */
  importStyle?: "photo" | "pattern";
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
    patternRepeat: Math.round(clamp(settings.patternRepeat ?? 0, 0, 6)),
    importStyle: settings.importStyle ?? "photo",
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

  if (typeof payload.canvasPaddingPercent === "number") {
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

  if (typeof project.canvasPaddingPercent === "number") {
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

  const boxes: Box[] = [colors];

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

/**
 * Auto-merges palette entries that are perceptually too similar.
 *
 * Problem: Median Cut on a 2-colour image with 11 slots creates
 * 11 near-identical shades (the 2 real colours + 9 boundary-bleed variants).
 * Those 11 shades then spread across bead cells as noise.
 *
 * Solution: repeatedly find the closest pair in the palette and merge them
 * until no two entries are within `threshold` of each other.
 * `threshold` = 18 % of the palette's total colour span — large enough to
 * collapse boundary variants, small enough to keep truly different colours.
 */
const collapseNearDuplicates = (
  palette: Array<{ color: string; red: number; green: number; blue: number }>,
  /** 0.18 for patterns (aggressive), 0.07 for photos (conservative) */
  thresholdFactor = 0.18,
): Array<{ color: string; red: number; green: number; blue: number }> => {
  if (palette.length <= 2) return palette;

  let maxDist = 0;
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const d = getColorDistance(palette[i], palette[j]);
      if (d > maxDist) maxDist = d;
    }
  }
  if (maxDist === 0) return palette;

  const threshold = maxDist * thresholdFactor;
  const result = palette.map((p) => ({ ...p }));

  let changed = true;
  while (changed && result.length > 2) {
    changed = false;
    let minDist = Infinity, minI = 0, minJ = 1;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const d = getColorDistance(result[i], result[j]);
        if (d < minDist) { minDist = d; minI = i; minJ = j; }
      }
    }
    if (minDist < threshold) {
      const r = (result[minI].red   + result[minJ].red)   / 2;
      const g = (result[minI].green + result[minJ].green) / 2;
      const b = (result[minI].blue  + result[minJ].blue)  / 2;
      result[minI] = { color: normalizeImportedColor(rgbToHex(r, g, b)), red: r, green: g, blue: b };
      result.splice(minJ, 1);
      changed = true;
    }
  }
  return result;
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

const isMobileBrowser = () => {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
};

const tryShareBlob = async (blob: Blob, fileName: string) => {
  // On desktop, navigator.share either doesn't exist or opens an OS share dialog
  // which is awkward for file downloads — skip straight to downloadBlob.
  if (!isMobileBrowser()) return false;

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
    } catch {
      // AbortError (user dismissed) or other — ignore, share was initiated
    }
    return true;
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
  opacity = 1,
) => {
  const safeOpacity = Math.max(0, Math.min(1, opacity));
  const watermarkText = (text && text.trim()) ? text.trim() : WATERMARK_TEXT;
  const fontSize = Math.max(16, Math.round(Math.min(pixelWidth, pixelHeight) * 0.055));
  const stepX = fontSize * 7;
  const stepY = fontSize * 5;
  const angleRad = (45 * Math.PI) / 180;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.font = `italic 700 ${fontSize}px "Nunito", Georgia, "Times New Roman", serif`;
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
      context.strokeStyle = `rgba(255,255,255,${(0.55 * safeOpacity).toFixed(3)})`;
      context.lineWidth = Math.max(2, fontSize * 0.12);
      context.strokeText(watermarkText, 0, 0);

      // Тёмный текст — виден на светлом фоне
      context.fillStyle = `rgba(0,0,0,${(0.38 * safeOpacity).toFixed(3)})`;
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
    patternRepeat?: number;
    importStyle?: "photo" | "pattern";
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
    // Pattern mode: tile the image N×N times across the grid.
    // The tile is aspect-ratio-cropped to match the grid's visual proportions.
    // N = user-specified or auto (grows with grid size).
    const gridVisualW = (width + 1) * xStep;
    const gridVisualH = (height * 2 + 1) * yStep;
    const gridAspect = gridVisualW / gridVisualH;
    const cropAspect = srcCropW / srcCropH;

    // Center-crop source to grid aspect ratio
    let sx = srcCropX, sy = srcCropY, sw = srcCropW, sh = srcCropH;
    if (cropAspect > gridAspect) {
      sw = Math.round(srcCropH * gridAspect);
      sx = srcCropX + Math.round((srcCropW - sw) / 2);
    } else {
      sh = Math.round(srcCropW / gridAspect);
      sy = srcCropY + Math.round((srcCropH - sh) / 2);
    }

    // Auto repeat count: ~1 for small grids, ~3 for 50×50, ~5 for 100×100
    const autoRepeat = Math.max(1, Math.round(Math.sqrt(width * height) / 18));
    const repeat = (options.patternRepeat && options.patternRepeat > 0)
      ? options.patternRepeat
      : autoRepeat;

    const tileW = Math.max(1, Math.round(processingSize.width  / repeat));
    const tileH = Math.max(1, Math.round(processingSize.height / repeat));

    const tileCanvas = document.createElement("canvas");
    tileCanvas.width  = tileW;
    tileCanvas.height = tileH;
    const tileCtx = tileCanvas.getContext("2d");
    if (tileCtx) {
      tileCtx.fillStyle = BASE_COLOR;
      tileCtx.fillRect(0, 0, tileW, tileH);
      tileCtx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in tileCtx) tileCtx.imageSmoothingQuality = "high" as ImageSmoothingQuality;
      tileCtx.drawImage(image, sx, sy, sw, sh, 0, 0, tileW, tileH);
      for (let ty = 0; ty < processingSize.height; ty += tileH) {
        for (let tx = 0; tx < processingSize.width; tx += tileW) {
          context.drawImage(tileCanvas, tx, ty);
        }
      }
    } else {
      context.drawImage(image, sx, sy, sw, sh, 0, 0, processingSize.width, processingSize.height);
    }
  } else {
    // Full mode
    context.drawImage(image, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, processingSize.width, processingSize.height);
  }

  const cells: string[] = [];

  if (sourceMode === "image") {
    const detailScale = detail / MAX_IMPORT_DETAIL;
    const importStyle = options?.importStyle ?? "photo";

    // ── PHOTO mode ────────────────────────────────────────────────────────────
    // Detail slider  → blur (lower = smoother) + canvas resolution
    // Color count    → palette from FULL canvas pixels (not cell averages)
    //                  so the palette is representative of the whole image
    if (importStyle === "photo") {

      // Step A — pre-blur based on detail (lower detail = stronger blur = smoother result)
      const cellPixelW = processingSize.width  / (width + 1);
      const cellPixelH = processingSize.height / (height * 2 + 1);
      const cellPx = Math.min(cellPixelW, cellPixelH);
      const blurDivisor = Math.max(1, cellPx * (1 - detailScale) * 0.5);
      if (blurDivisor > 1.5) {
        const bw = Math.max(4, Math.round(processingSize.width  / blurDivisor));
        const bh = Math.max(4, Math.round(processingSize.height / blurDivisor));
        const blurCanvas = document.createElement("canvas");
        blurCanvas.width = bw; blurCanvas.height = bh;
        const bCtx = blurCanvas.getContext("2d");
        if (bCtx) {
          bCtx.imageSmoothingEnabled = true;
          if ("imageSmoothingQuality" in bCtx) bCtx.imageSmoothingQuality = "high" as ImageSmoothingQuality;
          bCtx.drawImage(context.canvas, 0, 0, bw, bh);
          context.fillStyle = BASE_COLOR;
          context.fillRect(0, 0, processingSize.width, processingSize.height);
          context.drawImage(blurCanvas, 0, 0, processingSize.width, processingSize.height);
        }
      }

      const imgData = context.getImageData(0, 0, processingSize.width, processingSize.height).data;

      // Step B — build palette from FULL canvas pixels (representative of entire image)
      const totalPx = processingSize.width * processingSize.height;
      const sampleEvery = Math.max(1, Math.floor(totalPx / 10000));
      const paletteInput: Array<{ red: number; green: number; blue: number }> = [];
      for (let i = 0; i < imgData.length; i += 4 * sampleEvery) {
        if (imgData[i + 3] > 16) paletteInput.push({ red: imgData[i], green: imgData[i + 1], blue: imgData[i + 2] });
      }
      // No collapseNearDuplicates for photo — respect the requested colorCount
      const palette = buildMedianCutPalette(paletteInput, colorCount);
      if (palette.length === 0) return Array(rowCount * (width + 1)).fill(BASE_COLOR);
      const paletteHex = palette.map(p => normalizeImportedColor(rgbToHex(p.red, p.green, p.blue)));

      // Step C — sample each cell by averaging pixels, then map to nearest palette color
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const rowLength = rowIndex % 2 === 0 ? width : width + 1;
        const startY = Math.floor((rowIndex / rowCount) * processingSize.height);
        const endY = Math.max(startY + 1, Math.floor(((rowIndex + 1) / rowCount) * processingSize.height));

        for (let colIndex = 0; colIndex < rowLength; colIndex += 1) {
          const startX = Math.floor((colIndex / rowLength) * processingSize.width);
          const endX = Math.max(startX + 1, Math.floor(((colIndex + 1) / rowLength) * processingSize.width));

          let r = 0, g = 0, b = 0, cnt = 0;
          for (let sy = startY; sy < Math.min(endY, processingSize.height); sy++) {
            for (let sx = startX; sx < Math.min(endX, processingSize.width); sx++) {
              const idx = (sy * processingSize.width + sx) * 4;
              if (imgData[idx + 3] < 16) continue;
              r += imgData[idx]; g += imgData[idx + 1]; b += imgData[idx + 2]; cnt++;
            }
          }

          if (cnt === 0) { cells.push(BASE_COLOR); continue; }

          const avgRgb = { red: r / cnt, green: g / cnt, blue: b / cnt };
          let best = palette[0], bestDist = Infinity;
          for (let pi = 0; pi < palette.length; pi++) {
            const d = getColorDistance(avgRgb, palette[pi]);
            if (d < bestDist) { bestDist = d; best = palette[pi]; }
          }
          cells.push(paletteHex[palette.indexOf(best)]);
        }
      }

      const cellArea = width * height;
      const smoothPasses = cellArea < 200 ? 3 : cellArea < 600 ? 2 : 1;
      return smoothCellColors(cells, width, height, smoothPasses, cellArea < 600 ? 1 : 0);
    }

    // ── PATTERN mode: sharp, high-contrast, pre-quantize canvas ──────────────
    // Strong contrast boost → sharp color separation.
    // Palette from original pixels → accurate colors.
    // LUT remapping → clean regions.
    const contrastBoost = 1.30 + (1 - detailScale) * 0.20; // 1.30–1.50
    const satBoost = 1.05;

    // Read original pixels for palette (accurate colors)
    const origData = context.getImageData(0, 0, processingSize.width, processingSize.height);
    const orig = origData.data;
    const totalPx = processingSize.width * processingSize.height;
    const sampleEvery = Math.max(1, Math.floor(totalPx / 8000));
    const paletteInput: Array<{ red: number; green: number; blue: number }> = [];
    for (let i = 0; i < orig.length; i += 4 * sampleEvery) {
      if (orig[i + 3] < 16) continue;
      const { h, s, l } = rgbToHsl(orig[i], orig[i + 1], orig[i + 2]);
      const { r, g, b } = hslToRgb(h, clamp(s * 1.05, 0, 1), l);
      paletteInput.push({ red: r, green: g, blue: b });
    }
    const palette = collapseNearDuplicates(buildMedianCutPalette(paletteInput, colorCount), 0.18);
    if (palette.length === 0) return Array(rowCount * (width + 1)).fill(BASE_COLOR);

    // Contrast-boost pixels for sharp quantization
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

    // LUT: boosted bucket → palette index
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

    // Remap boosted pixels → original palette colors
    for (let i = 0; i < pp.length; i += 4) {
      if (pp[i + 3] < 16) continue;
      const pi = lut[(pp[i] >> 3) * LS * LS + (pp[i + 1] >> 3) * LS + (pp[i + 2] >> 3)];
      pp[i]     = Math.round(palette[pi].red);
      pp[i + 1] = Math.round(palette[pi].green);
      pp[i + 2] = Math.round(palette[pi].blue);
    }

    const paletteHex = palette.map((p) => normalizeImportedColor(rgbToHex(p.red, p.green, p.blue)));
    const counts = new Int32Array(palette.length);

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
            if (pp[idx + 3] < 16) continue;
            counts[lut[(pp[idx] >> 3) * LS * LS + (pp[idx + 1] >> 3) * LS + (pp[idx + 2] >> 3)]]++;
            total++;
          }
        }
        if (total === 0) { cells.push(BASE_COLOR); continue; }
        let bestPi = 0;
        for (let pi = 1; pi < counts.length; pi++) if (counts[pi] > counts[bestPi]) bestPi = pi;
        cells.push(paletteHex[bestPi]);
      }
    }

    return smoothCellColors(cells, width, height, 1, 0);
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

  // Larger preview size for crisper result panel
  const PREVIEW_SIZE = 520;
  const previewBead = Math.max(3, Math.min(16, Math.floor(PREVIEW_SIZE * 0.82 / maxRowLength)));
  const previewXStep = previewBead * 0.86;
  const previewYStep = previewBead * 0.74;
  const boardWidth  = (maxRowLength - 1) * previewXStep + previewBead;
  const boardHeight = (rowCount - 1) * previewYStep + previewBead;
  const scale = Math.min(PREVIEW_SIZE / boardWidth, PREVIEW_SIZE / boardHeight, 1);

  const padding = 10;
  const canvasWidth  = Math.max(1, Math.round(boardWidth  * scale + padding * 2));
  const canvasHeight = Math.max(1, Math.round(boardHeight * scale + padding * 2));
  const DPR = 2;

  const canvas = document.createElement("canvas");
  canvas.width  = canvasWidth  * DPR;
  canvas.height = canvasHeight * DPR;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось подготовить превью");

  ctx.scale(DPR, DPR);

  // Background: use seed's backgroundColor if set, otherwise neutral dark (like editor)
  ctx.fillStyle = seed.backgroundColor ?? "#1a1d27";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const cells = Array.isArray(seed.cells) ? seed.cells : [];
  let cellIndex = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowLength = rowIndex % 2 === 0 ? width : width + 1;
    const rowStartX = rowLength === maxRowLength ? 0 : previewXStep / 2;

    for (let colIndex = 0; colIndex < rowLength; colIndex += 1) {
      const color = cells[cellIndex] ?? BASE_COLOR;
      cellIndex += 1;

      if (isInactiveCell(color)) continue;

      // Render exactly like CanvasGrid: flat fill + thin dark border
      const fillColor = color === BASE_COLOR ? "#f4f5f7" : color;
      const r = Math.max(1.5, (previewBead * scale) / 2 - 0.5);
      const cx = padding + (rowStartX + colIndex * previewXStep) * scale + previewBead * scale / 2;
      const cy = padding + rowIndex * previewYStep * scale + previewBead * scale / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.lineWidth = Math.max(0.5, r * 0.12);
      ctx.strokeStyle = color === BASE_COLOR ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.18)";
      ctx.stroke();
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

/**
 * Вшивает метаданные проекта в готовые байты PNG.
 * Используется для синхронного экспорта через canvas.toDataURL().
 */
export const addMetadataToPngBytes = (bytes: Uint8Array, project: GridSeed): Uint8Array => {
  const payload = createProjectPngPayload(project);
  return insertMetadataChunk(bytes, payload);
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

export type SuggestedSize = { width: number; height: number };

export type SmartImportAnalysis = {
  colorCount: number;
  detail: number;
  importMode: "full" | "pattern";
  patternRepeat: number;
  isGeometric: boolean;
  edgeDensity: number;
  suggestedSizes: SuggestedSize[];
};

/**
 * Analyses the image and returns optimal import settings.
 *
 * Improvements over v1:
 * - Real micro-quantization (Median Cut + collapseNearDuplicates) for accurate colour count
 * - Multi-row autocorrelation for reliable pattern detection
 * - Grid-size-aware colour cap (large grids can support more colours)
 * - Suggested sizes based on aspect ratio + image complexity
 */
export const analyzeImageForImport = async (
  file: File,
  gridWidth: number,
  gridHeight: number,
): Promise<SmartImportAnalysis> => {
  const image = await loadImageFromFile(file);
  const imgW = Math.max(1, image.naturalWidth || image.width || 1);
  const imgH = Math.max(1, image.naturalHeight || image.height || 1);
  const imgAspect = imgW / imgH;

  const SIZE = 128;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const fallback = (): SmartImportAnalysis => {
    const { colorCount, detail } = getAdaptiveDefaults(gridWidth, gridHeight);
    return {
      colorCount, detail, importMode: "full", patternRepeat: 0,
      isGeometric: false, edgeDensity: 0.5, suggestedSizes: [],
    };
  };
  if (!ctx) return fallback();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(image, 0, 0, SIZE, SIZE);
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

  // ── 1. True colour count via micro-quantization ───────────────────────────
  // Boost contrast (same formula as main pipeline) so boundary bleed is removed
  const boostedColors: Array<{ red: number; green: number; blue: number }> = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const r = clamp(Math.round(128 + (data[i]     - 128) * 1.3), 0, 255);
    const g = clamp(Math.round(128 + (data[i + 1] - 128) * 1.3), 0, 255);
    const b = clamp(Math.round(128 + (data[i + 2] - 128) * 1.3), 0, 255);
    boostedColors.push({ red: r, green: g, blue: b });
  }
  const rawPalette  = buildMedianCutPalette(boostedColors, 48);
  const truePalette = collapseNearDuplicates(rawPalette);
  const naturalColors = truePalette.length; // actual distinct colours in image
  const isGeometric   = naturalColors <= 4;

  // ── 2. Edge density (Sobel gradient magnitude) ───────────────────────────
  let edgeSum = 0;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const c  = (y * SIZE + x) * 4;
      const cr = c + 4;
      const cd = c + SIZE * 4;
      const gx = Math.abs(data[c] - data[cr]) + Math.abs(data[c+1] - data[cr+1]) + Math.abs(data[c+2] - data[cr+2]);
      const gy = Math.abs(data[c] - data[cd]) + Math.abs(data[c+1] - data[cd+1]) + Math.abs(data[c+2] - data[cd+2]);
      edgeSum += Math.sqrt(gx * gx + gy * gy);
    }
  }
  const edgeDensity = clamp(edgeSum / (SIZE * SIZE * 200), 0, 1);

  // ── 3. Periodicity — multi-row autocorrelation ────────────────────────────
  // Sample 5 rows spread across image for robustness
  const testRows = [
    Math.floor(SIZE * 0.25), Math.floor(SIZE * 0.4),
    Math.floor(SIZE * 0.5),  Math.floor(SIZE * 0.6),
    Math.floor(SIZE * 0.75),
  ];
  let bestCorr = 0;
  for (let period = 6; period <= SIZE / 2; period++) {
    let totalCorr = 0;
    for (const ry of testRows) {
      let rowCorr = 0, cnt = 0;
      for (let x = 0; x + period < SIZE; x++) {
        const i1 = (ry * SIZE + x) * 4;
        const i2 = (ry * SIZE + x + period) * 4;
        const dr = data[i1] - data[i2];
        const dg = data[i1+1] - data[i2+1];
        const db = data[i1+2] - data[i2+2];
        rowCorr += 1 - Math.sqrt(dr*dr + dg*dg + db*db) / 441.7;
        cnt++;
      }
      totalCorr += cnt > 0 ? rowCorr / cnt : 0;
    }
    const avgCorr = totalCorr / testRows.length;
    if (avgCorr > bestCorr) bestCorr = avgCorr;
  }
  const isPeriodic = bestCorr > 0.80;

  // ── 4. Map to settings ────────────────────────────────────────────────────
  const cellArea = gridWidth * gridHeight;
  const gridFactor = clamp(Math.sqrt(cellArea) / 40, 0.5, 2.5);

  // Colour count: use true natural count, capped by grid capacity
  const maxForGrid = clamp(Math.round(Math.sqrt(cellArea) * 0.65), 2, MAX_IMPORT_COLOR_COUNT);
  const colorCount = clamp(naturalColors, MIN_IMPORT_COLOR_COUNT, maxForGrid);

  // Detail: geometric = high for crispness; photo = edge-driven + grid-scaled
  const detail = isGeometric
    ? clamp(Math.round(65 + edgeDensity * 25), 65, 92)
    : clamp(Math.round(42 + edgeDensity * 42 * gridFactor), 35, 88);

  // Mode & repeat
  const importMode: "full" | "pattern" = (isGeometric && isPeriodic) ? "pattern" : "full";
  const patternRepeat = importMode === "pattern"
    ? Math.max(1, Math.round(Math.sqrt(cellArea) / 18))
    : 0;

  // ── 5. Suggested grid sizes ───────────────────────────────────────────────
  // Base sizes depend on image complexity; aspect ratio shapes W vs H
  const baseSizes = isGeometric
    ? [20, 30, 40, 50]
    : edgeDensity < 0.35
    ? [25, 35, 50, 65]
    : [30, 45, 60, 80];

  const suggestedSizes: SuggestedSize[] = baseSizes.map(base => ({
    width:  clamp(Math.round(base * Math.sqrt(imgAspect)), 5, MAX_IMPORT_SIZE),
    height: clamp(Math.round(base / Math.sqrt(imgAspect)), 5, MAX_IMPORT_SIZE),
  }));

  return { colorCount, detail, importMode, patternRepeat, isGeometric, edgeDensity, suggestedSizes };
};

/**
 * Computes how "clean" a bead grid looks (0–1).
 * Metric: fraction of cells where ≥ 2 of the 6 hex neighbours share the same colour.
 * High score → large coherent colour regions → visually pleasing bead art.
 */
export const computeGridQuality = (
  cells: string[],
  width: number,
  height: number,
): number => {
  const rowCount = height * 2 + 1;
  const rowStart = new Array<number>(rowCount);
  const rowLen   = new Array<number>(rowCount);
  let offset = 0;
  for (let r = 0; r < rowCount; r++) {
    rowStart[r] = offset;
    rowLen[r]   = r % 2 === 0 ? width : width + 1;
    offset += rowLen[r];
  }

  let coherent = 0, total = 0;

  for (let r = 0; r < rowCount; r++) {
    const isEven = r % 2 === 0;
    const len = rowLen[r];
    for (let c = 0; c < len; c++) {
      const ci    = rowStart[r] + c;
      const color = cells[ci];
      if (!color || color === "__inactive__") continue;

      const neighbors: string[] = [];
      if (c > 0)       neighbors.push(cells[rowStart[r] + c - 1]);
      if (c < len - 1) neighbors.push(cells[rowStart[r] + c + 1]);

      for (const adjR of [r - 1, r + 1]) {
        if (adjR < 0 || adjR >= rowCount) continue;
        const adjLen = rowLen[adjR];
        const n1 = isEven ? c     : c - 1;
        const n2 = isEven ? c + 1 : c;
        if (n1 >= 0 && n1 < adjLen) neighbors.push(cells[rowStart[adjR] + n1]);
        if (n2 >= 0 && n2 < adjLen) neighbors.push(cells[rowStart[adjR] + n2]);
      }

      if (neighbors.filter(n => n === color).length >= 2) coherent++;
      total++;
    }
  }

  return total > 0 ? coherent / total : 0;
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
      patternRepeat: normalizedSettings.patternRepeat,
      importStyle: normalizedSettings.importStyle ?? "photo",
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

/** Offset in bead-grid cells (not hex rows) */
export type PlacementOffset = { x: number; y: number };

/**
 * Places an imported seed (smaller grid) inside a larger full grid.
 * Cells outside the import area are filled with BASE_COLOR.
 *
 * offsetX — column offset (in cells from left edge of full grid)
 * offsetY — row offset  (in bead rows from top edge, NOT hex rows)
 */
export const applyPlacementToGrid = (
  importSeed: GridSeed,
  fullWidth: number,
  fullHeight: number,
  offset: PlacementOffset,
): GridSeed => {
  const iW = Math.max(1, importSeed.width);
  const iH = Math.max(1, importSeed.height);
  const importCells = Array.isArray(importSeed.cells) ? importSeed.cells : [];

  // Pre-compute import row starts and lengths (hex layout)
  const iRowCount = iH * 2 + 1;
  const iRowStart = new Array<number>(iRowCount);
  const iRowLen   = new Array<number>(iRowCount);
  let off = 0;
  for (let r = 0; r < iRowCount; r++) {
    iRowStart[r] = off;
    iRowLen[r]   = r % 2 === 0 ? iW : iW + 1;
    off += iRowLen[r];
  }

  const fRowCount = fullHeight * 2 + 1;
  // offsetY in "bead rows" maps to offsetY*2 in hex rows
  const hexOffsetY = offset.y * 2;
  const hexOffsetX = offset.x;

  const fullCells: string[] = [];

  for (let fRow = 0; fRow < fRowCount; fRow++) {
    const fRowLen = fRow % 2 === 0 ? fullWidth : fullWidth + 1;
    const iRow = fRow - hexOffsetY;

    for (let fCol = 0; fCol < fRowLen; fCol++) {
      const iCol = fCol - hexOffsetX;

      if (
        iRow >= 0 && iRow < iRowCount &&
        iCol >= 0 && iCol < iRowLen[iRow]
      ) {
        fullCells.push(importCells[iRowStart[iRow] + iCol] ?? BASE_COLOR);
      } else {
        fullCells.push(BASE_COLOR);
      }
    }
  }

  return { ...importSeed, width: fullWidth, height: fullHeight, cells: fullCells };
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
