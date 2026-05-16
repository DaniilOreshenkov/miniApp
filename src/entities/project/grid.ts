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
