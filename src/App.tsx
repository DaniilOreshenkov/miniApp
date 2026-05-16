/**
 * Публичная точка входа приложения.
 *
 * Файл специально оставлен маленьким: подключает глобальные стили,
 * переэкспортирует публичные типы проекта для старых импортов
 * и передаёт всю рабочую логику в `src/app/App.tsx`.
 */

import App from "./app/App";
import "./index.css";

export type { AppTheme } from "./app/theme";
export type {
  CanvasPaddingPercent,
  GridData,
  GridProject,
  GridSeed,
  GridShapeLayer,
  GridTextBoxData,
  GridTextLayer,
  ShapeFillMode,
  ShapeType,
  TextStyle,
} from "./entities/project/types";

export default App;
