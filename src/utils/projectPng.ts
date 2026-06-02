import type { GridSeed } from "../App";

export type ProjectPngPayload = GridSeed & {
  version: 1 | 2;
  name: string;
  width: number;
  height: number;
  cells: string[];
};

export type ImageImportSettings = {
  width: number;
  height: number;
  detail: number;
  colorCount: number;
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

const hexToRgb = (color: string) => {
  const normalized = color.replace("#", "");

  if (normalized.length !== 6) {
    return null;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if (
    !Number.isFinite(red) ||
    !Number.isFinite(green) ||
    !Number.isFinite(blue)
  ) {
    return null;
  }

  return { red, green, blue };
};

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
        if (selfFreqInNeighbors === 0 && maxFreq >= dominanceThreshold && maxColor !== cellColor) {
          next[ci] = maxColor;
        }
      }
    }

    current = next;
  }

  return current;
};

const reduceCellsToColorCount = (cells: string[], colorCount: number) => {
  const safeColorCount = Math.round(
    clamp(colorCount, MIN_IMPORT_COLOR_COUNT, MAX_IMPORT_COLOR_COUNT),
  );

  const colorStats = new Map<
    string,
    {
      count: number;
      red: number;
      green: number;
      blue: number;
    }
  >();

  cells.forEach((cell) => {
    if (cell === INACTIVE_CELL_COLOR) return;

    const rgb = hexToRgb(cell);
    if (!rgb) return;

    // Finer bucket (8 instead of 16) for better initial grouping
    const bucketRed = Math.round(rgb.red / 8) * 8;
    const bucketGreen = Math.round(rgb.green / 8) * 8;
    const bucketBlue = Math.round(rgb.blue / 8) * 8;
    const bucketKey = `${bucketRed}-${bucketGreen}-${bucketBlue}`;
    const current = colorStats.get(bucketKey);

    if (current) {
      current.count += 1;
      current.red += rgb.red;
      current.green += rgb.green;
      current.blue += rgb.blue;
      return;
    }

    colorStats.set(bucketKey, {
      count: 1,
      red: rgb.red,
      green: rgb.green,
      blue: rgb.blue,
    });
  });

  // All candidates sorted by frequency
  const candidates = Array.from(colorStats.values())
    .sort((a, b) => b.count - a.count)
    .map((item) => {
      const red = item.red / item.count;
      const green = item.green / item.count;
      const blue = item.blue / item.count;
      return {
        color: normalizeImportedColor(rgbToHex(red, green, blue)),
        red,
        green,
        blue,
        count: item.count,
      };
    });

  if (candidates.length === 0) {
    return cells;
  }

  // Diversity-aware palette selection (k-means++ style):
  // Each next color maximises both frequency and distance from already-selected colors.
  // This prevents the palette being "wasted" on many near-identical shades.
  const palette = [candidates[0]];
  const maxCount = candidates[0].count;

  while (palette.length < safeColorCount && palette.length < candidates.length) {
    let bestScore = -1;
    let bestIdx = 0;

    for (let i = 0; i < candidates.length; i++) {
      // Skip already selected
      if (palette.some((p) => p.color === candidates[i].color)) continue;

      const candidate = candidates[i];

      // Minimum perceptual distance to any already-selected color
      let minDist = Infinity;
      for (const p of palette) {
        const d = getColorDistance(candidate, p);
        if (d < minDist) minDist = d;
      }

      // Score balances distance (diversity) and frequency (coverage).
      // Normalise frequency so range stays predictable.
      const freqWeight = 0.3 + 0.7 * (candidate.count / maxCount);
      const score = Math.sqrt(minDist) * freqWeight;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    palette.push(candidates[bestIdx]);
  }

  if (palette.length === 0) {
    return cells;
  }

  return cells.map((cell) => {
    if (cell === INACTIVE_CELL_COLOR) return cell;

    const rgb = hexToRgb(cell);
    if (!rgb) return cell;

    let bestColor = palette[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    palette.forEach((paletteColor) => {
      const distance = getColorDistance(rgb, paletteColor);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestColor = paletteColor;
      }
    });

    return bestColor.color;
  });
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

  context.drawImage(image, 0, 0, processingSize.width, processingSize.height);

  const imageData = context.getImageData(
    0,
    0,
    processingSize.width,
    processingSize.height,
  ).data;
  const cells: string[] = [];

  if (sourceMode === "image") {
    const detailScale = detail / MAX_IMPORT_DETAIL;
    const virtualWidth = Math.max(1, Math.round(width * detailScale));
    const virtualHeight = Math.max(1, Math.round(height * detailScale));
    const virtualRowCount = virtualHeight * 2 + 1;
    const virtualColors: string[][] = [];

    for (let virtualRowIndex = 0; virtualRowIndex < virtualRowCount; virtualRowIndex += 1) {
      const virtualRowLength =
        virtualRowIndex % 2 === 0 ? virtualWidth : virtualWidth + 1;
      const rowColors: string[] = [];
      const startY = Math.floor((virtualRowIndex / virtualRowCount) * processingSize.height);
      const endY = Math.max(
        startY + 1,
        Math.floor(((virtualRowIndex + 1) / virtualRowCount) * processingSize.height),
      );

      for (
        let virtualColumnIndex = 0;
        virtualColumnIndex < virtualRowLength;
        virtualColumnIndex += 1
      ) {
        const startX = Math.floor((virtualColumnIndex / virtualRowLength) * processingSize.width);
        const endX = Math.max(
          startX + 1,
          Math.floor(((virtualColumnIndex + 1) / virtualRowLength) * processingSize.width),
        );
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (
          let sampleY = startY;
          sampleY < Math.min(endY, processingSize.height);
          sampleY += 1
        ) {
          for (
            let sampleX = startX;
            sampleX < Math.min(endX, processingSize.width);
            sampleX += 1
          ) {
            const index = (sampleY * processingSize.width + sampleX) * 4;
            const alpha = imageData[index + 3];

            if (alpha < 16) continue;

            red += imageData[index];
            green += imageData[index + 1];
            blue += imageData[index + 2];
            count += 1;
          }
        }

        if (count === 0) {
          rowColors.push(BASE_COLOR);
        } else {
          rowColors.push(
            normalizeImportedColor(rgbToHex(red / count, green / count, blue / count)),
          );
        }
      }

      virtualColors.push(rowColors);
    }

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowLength = rowIndex % 2 === 0 ? width : width + 1;
      const virtualRowIndex = clamp(
        Math.floor((rowIndex / rowCount) * virtualRowCount),
        0,
        virtualRowCount - 1,
      );
      const virtualRow = virtualColors[virtualRowIndex] ?? [];
      const virtualRowLength = Math.max(1, virtualRow.length);

      for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
        const virtualColumnIndex = clamp(
          Math.floor((columnIndex / rowLength) * virtualRowLength),
          0,
          virtualRowLength - 1,
        );

        cells.push(virtualRow[virtualColumnIndex] ?? BASE_COLOR);
      }
    }

    const reduced = reduceCellsToColorCount(cells, colorCount);
    // More passes for small grids (less data → more noise per cell),
    // fewer passes for large grids (enough cells to self-correct).
    const cellArea = width * height;
    const smoothPasses = cellArea < 300 ? 3 : cellArea < 1500 ? 2 : 1;
    return smoothCellColors(reduced, width, height, smoothPasses);
  }

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
