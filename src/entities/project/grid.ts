/**
 * Доменные helper-функции сетки.
 *
 * Здесь только чистые функции. Этот файл безопасно покрывать unit-тестами,
 * потому что он не зависит от React, DOM, canvas или Telegram API.
 */

export const BASE_GRID_CELL_COLOR = "#ffffff";

/** Возвращает количество бусин/ячеек для шахматной структуры сетки. */
export const getGridCellCount = (width: number, height: number) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const rowCount = safeHeight * 2 + 1;

  let total = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    total += rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  }

  return total;
};

/** Создаёт белую резервную сетку с корректным количеством ячеек. */
export const createEmptyCells = (width: number, height: number) => {
  return Array.from(
    { length: getGridCellCount(width, height) },
    () => BASE_GRID_CELL_COLOR,
  );
};

export const getRowCount = (height: number) => Math.max(1, height) * 2 + 1;

export const getRowLength = (width: number, rowIndex: number) => {
  const safeWidth = Math.max(1, width);
  return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
};

type HorizontalAnchor = "left" | "center" | "right";
type VerticalAnchor   = "top"  | "center" | "bottom";

const getResizeOffset = (oldSize: number, newSize: number, anchor: "start" | "center" | "end") => {
  const diff = Math.abs(newSize - oldSize);
  if (anchor === "start")  return 0;
  if (anchor === "center") return Math.floor(diff / 2);
  return diff;
};

const getHorizontalOffset = (oldLen: number, newLen: number, anchor: HorizontalAnchor) => {
  if (anchor === "left")   return 0;
  if (anchor === "center") return Math.floor(Math.abs(newLen - oldLen) / 2);
  return Math.abs(newLen - oldLen);
};

/** Изменяет размер массива ячеек с сохранением содержимого по якорю. */
export const resizeGridCells = (
  oldCells: string[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  hAnchor: HorizontalAnchor = "center",
  vAnchor: VerticalAnchor   = "center",
): string[] => {
  const nextCells = Array.from({ length: getGridCellCount(newWidth, newHeight) }, () => BASE_GRID_CELL_COLOR);

  const oldRowCount = getRowCount(oldHeight);
  const newRowCount = getRowCount(newHeight);

  const oldStart: number[] = [];
  const newStart: number[] = [];
  let idx = 0;
  for (let r = 0; r < oldRowCount; r++) { oldStart[r] = idx; idx += getRowLength(oldWidth, r); }
  idx = 0;
  for (let r = 0; r < newRowCount; r++) { newStart[r] = idx; idx += getRowLength(newWidth, r); }

  const vDir = vAnchor === "top" ? "start" : vAnchor === "bottom" ? "end" : "center";
  const oldRowCrop = oldRowCount > newRowCount ? getResizeOffset(oldRowCount, newRowCount, vDir) : 0;
  const newRowPlace = newRowCount > oldRowCount ? getResizeOffset(oldRowCount, newRowCount, vDir) : 0;

  for (let nr = 0; nr < newRowCount; nr++) {
    const or = nr - newRowPlace + oldRowCrop;
    if (or < 0 || or >= oldRowCount) continue;

    const oldLen = getRowLength(oldWidth, or);
    const newLen = getRowLength(newWidth, nr);
    const oldColCrop  = oldLen > newLen ? getHorizontalOffset(oldLen, newLen, hAnchor) : 0;
    const newColPlace = newLen > oldLen ? getHorizontalOffset(oldLen, newLen, hAnchor) : 0;

    for (let nc = 0; nc < newLen; nc++) {
      const oc = nc - newColPlace + oldColCrop;
      if (oc < 0 || oc >= oldLen) continue;
      const cell = oldCells[oldStart[or] + oc];
      if (cell) nextCells[newStart[nr] + nc] = cell;
    }
  }

  return nextCells;
};
