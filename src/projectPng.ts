import type { GridSeed } from "./App";

export type ProjectPngPayload = {
  version: 1;
  name: string;
  width: number;
  height: number;
  cells: string[];
};

export type ImageImportSettings = {
  width: number;
  height: number;
  detail: number;
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

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;
const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));
const EXPORT_PADDING = 24;
const EXPORT_DPR = 2;
const MAX_IMPORT_SIZE = 100;
const EXPORT_TOLERANCE = 3;
const MIN_IMPORT_DETAIL = 1;
const MAX_IMPORT_DETAIL = 100;
const PREVIEW_MAX_SIZE = 360;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
  };
};

const isValidPayload = (value: unknown): value is ProjectPngPayload => {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;

  return (
    payload.version === 1 &&
    typeof payload.name === "string" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number" &&
    Array.isArray(payload.cells) &&
    payload.cells.every((cell) => typeof cell === "string")
  );
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

const loadImageFromFile = (file: File) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось загрузить PNG"));
    };

    image.src = objectUrl;
  });
};

const rgbToHex = (red: number, green: number, blue: number) => {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
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

const inferExportedGridSize = (image: HTMLImageElement) => {
  const rawWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const rawHeight = Math.max(1, image.naturalHeight || image.height || 1);

  const logicalWidth = rawWidth / EXPORT_DPR;
  const logicalHeight = rawHeight / EXPORT_DPR;

  const boardWidth = logicalWidth - EXPORT_PADDING * 2;
  const boardHeight = logicalHeight - EXPORT_PADDING * 2;

  if (boardWidth <= bead || boardHeight <= bead) {
    return null;
  }

  const maxRowLength = Math.round((boardWidth - bead) / xStep + 1);
  const rowCount = Math.round((boardHeight - bead) / yStep + 1);

  if (maxRowLength < 2 || rowCount < 1 || rowCount % 2 === 0) {
    return null;
  }

  const width = maxRowLength - 1;
  const height = (rowCount - 1) / 2;

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMPORT_SIZE ||
    height > MAX_IMPORT_SIZE
  ) {
    return null;
  }

  const expectedBoardWidth = (maxRowLength - 1) * xStep + bead;
  const expectedBoardHeight = (rowCount - 1) * yStep + bead;

  if (
    Math.abs(expectedBoardWidth - boardWidth) > EXPORT_TOLERANCE ||
    Math.abs(expectedBoardHeight - boardHeight) > EXPORT_TOLERANCE
  ) {
    return null;
  }

  return { width, height };
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

const isTelegramDesktop = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const maybeWindow = window as Window & {
    Telegram?: {
      WebApp?: unknown;
    };
  };

  return Boolean(maybeWindow.Telegram?.WebApp) && navigator.maxTouchPoints === 0;
};

const deliverBytes = async (bytes: Uint8Array, fileName: string) => {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  const safeName = `${sanitizeFileName(fileName)}.png`;
  const blob = new Blob([arrayBuffer], { type: "image/png" });

  if (isTelegramDesktop()) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Не удалось подготовить PNG"));
        }
      };

      reader.onerror = () => {
        reject(new Error("Не удалось подготовить PNG"));
      };

      reader.readAsDataURL(blob);
    });

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

const sampleCellsFromImage = (
  image: HTMLImageElement,
  width: number,
  height: number,
  options?: {
    blankWhiteAsInactive?: boolean;
    detail?: number;
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

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = rawWidth;
  sampleCanvas.height = rawHeight;

  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Не удалось подготовить PNG");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, rawWidth, rawHeight);
  context.drawImage(image, 0, 0, rawWidth, rawHeight);

  const imageData = context.getImageData(0, 0, rawWidth, rawHeight).data;
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
      const startY = Math.floor((virtualRowIndex / virtualRowCount) * rawHeight);
      const endY = Math.max(
        startY + 1,
        Math.floor(((virtualRowIndex + 1) / virtualRowCount) * rawHeight),
      );

      for (
        let virtualColumnIndex = 0;
        virtualColumnIndex < virtualRowLength;
        virtualColumnIndex += 1
      ) {
        const startX = Math.floor((virtualColumnIndex / virtualRowLength) * rawWidth);
        const endX = Math.max(
          startX + 1,
          Math.floor(((virtualColumnIndex + 1) / virtualRowLength) * rawWidth),
        );
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (let sampleY = startY; sampleY < Math.min(endY, rawHeight); sampleY += 1) {
          for (let sampleX = startX; sampleX < Math.min(endX, rawWidth); sampleX += 1) {
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

    return cells;
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

export const exportProjectToPng = async (project: GridSeed) => {
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

  const payload: ProjectPngPayload = {
    version: 1,
    name: project.name,
    width,
    height,
    cells,
  };

  const rawPng = await canvasToPngBytes(canvas);
  const pngWithMetadata = insertMetadataChunk(rawPng, payload);
  await deliverBytes(pngWithMetadata, project.name);
};

export const parseProjectPng = async (
  file: File,
): Promise<GridSeed | null> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const payload = readMetadataChunk(bytes);

  if (!payload) return null;

  return {
    name: payload.name,
    width: payload.width,
    height: payload.height,
    cells: payload.cells,
  };
};

export const tryImportProjectPng = async (
  file: File,
): Promise<GridSeed | null> => {
  const embeddedProject = await parseProjectPng(file);
  if (embeddedProject) {
    return embeddedProject;
  }

  const image = await loadImageFromFile(file);
  const exportedGridSize = inferExportedGridSize(image);

  if (!exportedGridSize) {
    return null;
  }

  const cells = sampleCellsFromImage(
    image,
    exportedGridSize.width,
    exportedGridSize.height,
    {
      blankWhiteAsInactive: true,
      sourceMode: "beadly-export",
    },
  );

  return {
    name: stripExtension(file.name) || "Импорт PNG",
    width: exportedGridSize.width,
    height: exportedGridSize.height,
    cells,
  };
};

export const getDefaultImageImportSettings = async (
  file: File,
): Promise<ImageImportSettings> => {
  const image = await loadImageFromFile(file);
  const size = getFallbackImportSizeFromImage(image);

  return {
    width: size.width,
    height: size.height,
    detail: 70,
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
        ...getFallbackImportSizeFromImage(image),
        detail: 70,
      });
  const cells = sampleCellsFromImage(
    image,
    normalizedSettings.width,
    normalizedSettings.height,
    {
      detail: normalizedSettings.detail,
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
