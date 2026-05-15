export type CanvasPaddingPercent = 0 | 25 | 50;

export type ShapeType =
  | "oval"
  | "circle"
  | "square"
  | "triangle"
  | "cross"
  | "arrow"
  | "doubleArrow";

export type ShapeFillMode = "fill" | "stroke";
export type TextStyle = "plain" | "bubble" | "shadow";

export type GridTextBoxData = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type GridTextLayer = {
  id: number;
  value: string;
  color: string;
  size: number;
  style: TextStyle;
  rotation: number;
  box?: GridTextBoxData;
};

export type GridShapeLayer = {
  id: string;
  type: ShapeType;
  color: string;
  fillMode?: ShapeFillMode;
  start: { x: number; y: number };
  end: { x: number; y: number };
  rotation?: number;
};

export type GridProjectExtras = {
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  canvasPaddingPercent?: CanvasPaddingPercent;
  textLayers?: GridTextLayer[];
  shapeLayers?: GridShapeLayer[];
  activeShapeLayerId?: string | null;
};

export type GridSeed = {
  name: string;
  width: number;
  height: number;
  cells?: string[];
} & GridProjectExtras;

export type GridProject = {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: string[];
  updatedAt: string;
} & GridProjectExtras;

export type GridData = GridProject | null;
