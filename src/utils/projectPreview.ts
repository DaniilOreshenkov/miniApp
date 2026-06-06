import type { GridProject } from "../App";
import { getRowCount, getRowLength } from "../entities/project/grid";

export type ProjectPreviewDot = {
  key: string;
  x: number;
  y: number;
  color: string;
  isWhite: boolean;
};

// getRowCount и getRowLength реэкспортируются из entities/project/grid
// для обратной совместимости с импортами в других файлах
export { getRowCount, getRowLength };

const getRowStartIndex = (width: number, targetRowIndex: number) => {
  let startIndex = 0;

  for (let rowIndex = 0; rowIndex < targetRowIndex; rowIndex += 1) {
    startIndex += getRowLength(width, rowIndex);
  }

  return startIndex;
};

export const isWhiteCell = (color: string) => {
  const normalized = color.trim().toLowerCase();

  return (
    normalized === "#fff" || normalized === "#ffffff" || normalized === "white"
  );
};

export const createProjectPreviewDots = (
  project: GridProject,
  maxPreviewRows = 13,
  maxPreviewColumns = 14,
): ProjectPreviewDot[] => {
  const rowCount = getRowCount(project.height);
  const rowStep = Math.max(1, Math.ceil(rowCount / maxPreviewRows));
  const dots: ProjectPreviewDot[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += rowStep) {
    const rowLength = getRowLength(project.width, rowIndex);
    const rowStartIndex = getRowStartIndex(project.width, rowIndex);
    const columnStep = Math.max(1, Math.ceil(rowLength / maxPreviewColumns));

    for (let cellIndex = 0; cellIndex < rowLength; cellIndex += columnStep) {
      const color = project.cells[rowStartIndex + cellIndex] ?? "#ffffff";
      const x = 8 + (cellIndex / Math.max(1, rowLength - 1)) * 84;
      const y = 8 + (rowIndex / Math.max(1, rowCount - 1)) * 84;

      dots.push({
        key: `${rowIndex}-${cellIndex}`,
        x,
        y,
        color,
        isWhite: isWhiteCell(color),
      });
    }
  }

  return dots;
};
