import type { GridSeed } from "./App";

export type ProjectPngPayload = {
  version: 1;
  name: string;
  width: number;
  height: number;
  cells: string[];
};

const PNG_SIGNATURE = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
]);
const METADATA_KEYWORD = "beadly-project";
const BASE_COLOR = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;
const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));
const EXPORT_PADDING = 24;
const EXPORT_DPR = 2;
const MAX_IMPORT_SIZE = 100;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

const getImportSizeFromImage = (image: HTMLImageElement) => {
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

const deliverBytes = async (bytes: Uint8Array, fileName: string) => {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  const safeName = `${sanitizeFileName(fileName)}.png`;
  const blob = new Blob([arrayBuffer], { type: "image/png" });
  const file = new File([blob], safeName, { type: "image/png" });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
      });
      return;
    }
  } catch (error) {
    console.error("Share failed, fallback to download:", error);
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

export const importImageToGridSeed = async (file: File): Promise<GridSeed> => {
  const embeddedProject = await parseProjectPng(file);
  if (embeddedProject) {
    return embeddedProject;
  }

  const image = await loadImageFromFile(file);
  const { width, height } = getImportSizeFromImage(image);
  const rowCount = height * 2 + 1;
  const maxRowLength = width + 1;
  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const sampleCanvas = document.createElement("canvas");
  const sampleWidth = Math.max(320, Math.min(1600, maxRowLength * 8));
  const sampleHeight = Math.max(320, Math.min(2200, rowCount * 8));

  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;

  const context = sampleCanvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить PNG");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sampleWidth, sampleHeight);
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const cells: string[] = [];

  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? width : width + 1;
  };

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowLength = getRowLength(rowIndex);
    const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

    for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
      const centerX = rowStartX + columnIndex * xStep + bead / 2;
      const centerY = rowIndex * yStep + bead / 2;

      const normalizedX = boardWidth <= 0 ? 0.5 : centerX / boardWidth;
      const normalizedY = boardHeight <= 0 ? 0.5 : centerY / boardHeight;

      const pixelX = Math.max(
        0,
        Math.min(sampleWidth - 1, Math.round(normalizedX * (sampleWidth - 1))),
      );
      const pixelY = Math.max(
        0,
        Math.min(sampleHeight - 1, Math.round(normalizedY * (sampleHeight - 1))),
      );

      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(
            0,
            Math.min(sampleWidth - 1, pixelX + offsetX),
          );
          const sampleY = Math.max(
            0,
            Math.min(sampleHeight - 1, pixelY + offsetY),
          );
          const index = (sampleY * sampleWidth + sampleX) * 4;

          const alpha = imageData[index + 3];
          if (alpha < 16) continue;

          red += imageData[index];
          green += imageData[index + 1];
          blue += imageData[index + 2];
          count += 1;
        }
      }

      if (count === 0) {
        cells.push(BASE_COLOR);
      } else {
        cells.push(rgbToHex(red / count, green / count, blue / count));
      }
    }
  }

  return {
    name: stripExtension(file.name) || "Импорт PNG",
    width,
    height,
    cells,
  };
};