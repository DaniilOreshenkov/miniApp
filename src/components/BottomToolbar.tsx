import React, { useEffect, useRef, useState } from "react";

type Tool =
  | "move"
  | "brush"
  | "erase"
  | "add"
  | "deactivate"
  | "ruler"
  | "shape"
  | "text"
  | "background";

type SettingsTool = Exclude<Tool, "move" | "add" | "deactivate"> | "beads";
type ShapeType = "oval" | "circle" | "square" | "triangle" | "cross" | "arrow" | "doubleArrow";
type TextAlign = "left" | "center" | "right";

interface Props {
  active: Tool;
  activeColor: string;
  toolSize: number;
  rulerVisible: boolean;
  rulerLocked: boolean;
  rulerSize: number;
  rulerTextVisible: boolean;
  shapeType: ShapeType;
  onToolSizeChange: (size: number) => void;
  onChange: (tool: Tool) => void;
  onOpenPalette: () => void;
  onToggleRulerVisible: () => void;
  onToggleRulerLocked: () => void;
  onRulerSizeChange: (size: number) => void;
  onToggleRulerTextVisible: () => void;
  onShapeTypeChange: (shapeType: ShapeType) => void;
  onApplyShape?: () => void;
  onClearShape?: () => void;
  onDeleteShape?: () => void;
  onAddTextLayer?: () => void;
  onRemoveTextLayer?: () => void;
  hasTextLayer?: boolean;
  textSize?: number;
  textPanelVisible?: boolean;
  textPanelMode?: "text" | "size";
  textAlign?: TextAlign;
  textOverlayOpen?: boolean;
  onToggleTextPanel?: () => void;
  onTextAlignChange?: (align: TextAlign) => void;
  onShowTextSize?: () => void;
  onCloseTextOverlay?: () => void;
  onImportBackgroundImage?: (file: File) => void;
  onClearBackgroundColor?: () => void;
  onClearBackgroundImage?: () => void;
  hasBackgroundImage?: boolean;
}

const SIZE_PRESETS = [1, 2, 3, 5, 8];
const RULER_SIZE_OPTIONS = [24, 32, 44];

const getSizePresetDotSize = (size: number) => {
  switch (size) {
    case 1:
      return 10;
    case 2:
      return 14;
    case 3:
      return 18;
    case 5:
      return 24;
    case 8:
      return 30;
    default:
      return 18;
  }
};

const BottomToolbar: React.FC<Props> = ({
  active,
  activeColor,
  toolSize,
  rulerVisible,
  rulerLocked,
  rulerSize,
  rulerTextVisible,
  shapeType,
  onToolSizeChange,
  onChange,
  onOpenPalette,
  onToggleRulerVisible,
  onToggleRulerLocked,
  onRulerSizeChange,
  onToggleRulerTextVisible,
  onShapeTypeChange,
  onApplyShape,
  onClearShape,
  onDeleteShape,
  onAddTextLayer,
  onRemoveTextLayer,
  hasTextLayer = false,
  textSize = 32,
  textPanelVisible = false,
  textPanelMode = "text",
  textAlign = "center",
  textOverlayOpen = false,
  onToggleTextPanel,
  onTextAlignChange,
  onShowTextSize,
  onCloseTextOverlay,
  onImportBackgroundImage,
  onClearBackgroundColor,
  onClearBackgroundImage,
  hasBackgroundImage = false,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mainToolsScrollLeftRef = useRef(0);
  const [settingsTool, setSettingsTool] = useState<SettingsTool | null>(null);
  const [sizePickerOpen, setSizePickerOpen] = useState(false);

  const dragRef = useRef({
    isDown: false,
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const shouldShowTextControls = hasTextLayer;

  const rememberMainToolsScroll = () => {
    if (!scrollRef.current || settingsTool !== null) return;
    mainToolsScrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  const resetToolbarScroll = () => {
    window.requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = 0;
    });
  };

  const restoreMainToolsScroll = () => {
    window.requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = mainToolsScrollLeftRef.current;
    });
  };

  useEffect(() => {
    if (!sizePickerOpen) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const wrapperElement = wrapperRef.current;
      const target = event.target;

      if (!(target instanceof Node)) return;

      if (wrapperElement?.contains(target)) return;

      setSizePickerOpen(false);
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [sizePickerOpen]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    dragRef.current = {
      isDown: true,
      isDragging: false,
      startX: event.clientX,
      startScrollLeft: scrollElement.scrollLeft,
    };

    scrollElement.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    const drag = dragRef.current;

    if (!scrollElement || !drag.isDown) return;

    const diffX = event.clientX - drag.startX;

    if (Math.abs(diffX) > 4) {
      drag.isDragging = true;
    }

    if (!drag.isDragging) return;

    scrollElement.scrollLeft = drag.startScrollLeft - diffX;

    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    scrollElement?.releasePointerCapture?.(event.pointerId);

    window.setTimeout(() => {
      dragRef.current = {
        isDown: false,
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
      };
    }, 0);

    event.stopPropagation();
  };

  const handleToolClick = (nextTool: Tool) => {
    if (dragRef.current.isDragging) return;

    rememberMainToolsScroll();

    onChange(nextTool);
    setSizePickerOpen(false);


    if (nextTool === "add" || nextTool === "deactivate") {
      setSettingsTool("beads");
      return;
    }

    if (nextTool !== "move") {
      setSettingsTool(nextTool);
      resetToolbarScroll();
      return;
    }

    setSettingsTool(null);
    resetToolbarScroll();
  };

  const handleBeadsToolClick = () => {
    if (dragRef.current.isDragging) return;

    rememberMainToolsScroll();

    setSizePickerOpen(false);
    setSettingsTool("beads");
    resetToolbarScroll();

    if (active !== "add" && active !== "deactivate") {
      onChange("deactivate");
    }
  };

  const handleBeadsModeClick = (nextTool: "add" | "deactivate") => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onChange(nextTool);
  };

  const handleRulerSizeClick = (nextSize: number) => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onRulerSizeChange(nextSize);
  };

  const handleBackToTools = () => {
    if (settingsTool === "text" || textOverlayOpen) {
      onCloseTextOverlay?.();
    }

    setSettingsTool(null);
    setSizePickerOpen(false);
    restoreMainToolsScroll();
  };

  const handlePaletteClick = () => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onOpenPalette();
  };

  const handleShapeTypeClick = (nextShapeType: ShapeType) => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onShapeTypeChange(nextShapeType);
  };

  const handleApplyShape = () => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onApplyShape?.();
  };

  const handleClearShape = () => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);

    if (onClearShape) {
      onClearShape();
      return;
    }

    onDeleteShape?.();
  };

  const handleRemoveTextLayer = () => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onRemoveTextLayer?.();
  };

  const handleSizeButtonClick = () => {
    if (dragRef.current.isDragging) return;
    setSizePickerOpen((prev) => !prev);
  };

  const handleTextAlignClick = (align: TextAlign) => {
    if (dragRef.current.isDragging) return;

    setSizePickerOpen(false);
    onTextAlignChange?.(align);
  };

  const handleToggleTextPanel = () => {
    if (dragRef.current.isDragging) return;

    setSettingsTool("text");
    setSizePickerOpen(false);
    onToggleTextPanel?.();
  };


  const handleAddTextLayer = () => {
    if (dragRef.current.isDragging) return;

    setSettingsTool("text");
    setSizePickerOpen(false);
    onAddTextLayer?.();
  };

  const handleShowTextSize = () => {
    if (dragRef.current.isDragging) return;

    setSettingsTool("text");
    setSizePickerOpen(false);
    onShowTextSize?.();
  };

  const handleBackgroundImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    onImportBackgroundImage?.(file);
  };

  const handleClearBackgroundColor = () => {
    if (dragRef.current.isDragging) return;

    onClearBackgroundColor?.();
  };

  const handleClearBackgroundImage = () => {
    if (dragRef.current.isDragging) return;

    onClearBackgroundImage?.();
  };

  const handleSizePresetClick = (size: number) => {
    onToolSizeChange(size);
    setSizePickerOpen(false);
  };

  const shouldShowSizeButton =
    settingsTool !== null &&
    settingsTool !== "shape" &&
    settingsTool !== "text" &&
    settingsTool !== "background";

  return (
    <div ref={wrapperRef} style={wrapper}>
      {sizePickerOpen && shouldShowSizeButton ? (
        <div style={floatingSizePanel}>
          <div style={floatingSizeTitle}>Размер</div>

          {settingsTool === "ruler" ? (
            <div style={rulerSizePresetRow}>
              {RULER_SIZE_OPTIONS.map((size) => {
                const isActive = rulerSize === size;

                return (
                  <button
                    key={size}
                    type="button"
                    style={{
                      ...rulerSizePresetButton,
                      ...(isActive ? rulerSizePresetButtonActive : null),
                    }}
                    onClick={() => handleRulerSizeClick(size)}
                    aria-label={`Толщина линейки ${size}`}
                    title={`Толщина ${size}`}
                  >
                    <span
                      style={{
                        ...rulerSizePresetPreview,
                        height: Math.max(4, Math.round(size / 5)),
                      }}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={sizePresetRow}>
              {SIZE_PRESETS.map((size) => {
                const isActive = toolSize === size;
                const dotSize = getSizePresetDotSize(size);

                return (
                  <button
                    key={size}
                    type="button"
                    style={{
                      ...sizePresetButton,
                      ...(isActive ? sizePresetButtonActive : null),
                    }}
                    onClick={() => handleSizePresetClick(size)}
                    aria-label={`Размер ${size}`}
                    title={`Размер ${size}`}
                  >
                    <span style={sizePresetDotWrap}>
                      <span
                        style={{
                          ...sizePresetDot,
                          width: dotSize,
                          height: dotSize,
                          opacity: isActive ? 1 : 0.78,
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="bottom-toolbar-scroll"
        style={scrollArea}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {settingsTool ? (
          <div className="bottom-toolbar-track" style={settingsGroup}>
            <button
              type="button"
              style={backButton}
              onClick={handleBackToTools}
              aria-label="Назад к инструментам"
              title="Назад"
            >
              <BackIcon />
            </button>

            <div style={activeToolBadge}>
              {getToolIcon(settingsTool)}
              <span style={activeToolText}>{getToolName(settingsTool)}</span>
            </div>

            {settingsTool === "ruler" ? (
              <>
                <button
                  type="button"
                  style={wideActionButton}
                  onClick={onToggleRulerVisible}
                  aria-label={rulerVisible ? "Убрать линейку" : "Показать линейку"}
                  title={rulerVisible ? "Убрать" : "Показать"}
                >
                  {rulerVisible ? "Убрать" : "Показать"}
                </button>

                <button
                  type="button"
                  style={{
                    ...compactActionButton,
                    ...(sizePickerOpen ? compactActionButtonActive : null),
                  }}
                  onClick={handleSizeButtonClick}
                  aria-label="Размер линейки"
                  title="Размер"
                >
                  Размер
                </button>

                <button
                  type="button"
                  style={{
                    ...rulerTextButton,
                    ...(rulerTextVisible ? rulerTextButtonActive : null),
                  }}
                  onClick={onToggleRulerTextVisible}
                  aria-label={rulerTextVisible ? "Скрыть текст линейки" : "Показать текст линейки"}
                  title={rulerTextVisible ? "Скрыть текст" : "Показать текст"}
                >
                  <RulerTextIcon />
                </button>

                <button
                  type="button"
                  style={{
                    ...rulerLockButton,
                    ...(rulerLocked ? rulerLockButtonActive : null),
                  }}
                  onClick={onToggleRulerLocked}
                  aria-label={rulerLocked ? "Разблокировать линейку" : "Заблокировать линейку"}
                  title={rulerLocked ? "Разблокировать" : "Заблокировать"}
                >
                  {rulerLocked ? <LockIcon /> : <UnlockIcon />}
                </button>
              </>
            ) : null}

            {settingsTool === "beads" ? (
              <>
                <ModeButton
                  label="Скрыть"
                  active={active === "deactivate"}
                  onClick={() => handleBeadsModeClick("deactivate")}
                >
                  <InactiveCircleIcon />
                </ModeButton>

                <ModeButton
                  label="Вернуть"
                  active={active === "add"}
                  onClick={() => handleBeadsModeClick("add")}
                >
                  <AddCircleIcon />
                </ModeButton>
              </>
            ) : null}

            {settingsTool === "text" ? (
              <>
                {!shouldShowTextControls ? (
                  <button
                    type="button"
                    style={wideActionButton}
                    onClick={handleAddTextLayer}
                    aria-label="Добавить новый текст"
                    title="Добавить"
                  >
                    Добавить
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      style={wideActionButton}
                      onClick={handleAddTextLayer}
                      aria-label="Добавить ещё один текст"
                      title="Добавить ещё"
                    >
                      Добавить
                    </button>

                    <button
                      type="button"
                      style={textPanelToggleButton}
                      onClick={handleToggleTextPanel}
                      aria-label={textPanelVisible ? "Скрыть поле текста" : "Показать поле текста"}
                      title={textPanelVisible ? "Скрыть" : "Показать"}
                    >
                      {textPanelVisible ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </button>

                    <button
                      type="button"
                      style={wideActionButton}
                      onClick={handleRemoveTextLayer}
                      aria-label="Убрать выбранный текст"
                      title="Убрать"
                    >
                      Убрать
                    </button>

                    <button
                      type="button"
                      style={{
                        ...textSizeButton,
                        ...(textPanelVisible && textPanelMode === "size" ? textSizeButtonActive : null),
                      }}
                      onClick={handleShowTextSize}
                      aria-label="Настроить размер текста"
                      title="Размер"
                    >
                      <span style={textSizeButtonLabel}>Размер</span>
                      <span style={textSizeButtonValue}>{textSize}</span>
                    </button>

                    <div
                      style={textAlignControl}
                      role="group"
                      aria-label="Выравнивание текста"
                    >
                      <span style={textAlignControlLabel}>Равнение</span>

                      <div style={textAlignControlButtons}>
                        <TextAlignButton
                          label="Слева"
                          active={textAlign === "left"}
                          onClick={() => handleTextAlignClick("left")}
                        >
                          <AlignLeftIcon />
                        </TextAlignButton>

                        <TextAlignButton
                          label="По центру"
                          active={textAlign === "center"}
                          onClick={() => handleTextAlignClick("center")}
                        >
                          <AlignCenterIcon />
                        </TextAlignButton>

                        <TextAlignButton
                          label="Справа"
                          active={textAlign === "right"}
                          onClick={() => handleTextAlignClick("right")}
                        >
                          <AlignRightIcon />
                        </TextAlignButton>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={colorButton}
                      onClick={handlePaletteClick}
                      aria-label="Выбрать цвет текста"
                      title="Цвет"
                    >
                      <span style={{ ...colorDot, background: activeColor }} />
                      <PaletteIcon />
                    </button>
                  </>
                )}
              </>
            ) : null}

            {settingsTool === "shape" ? (
              <>
                <ShapeButton
                  label="Овал"
                  active={shapeType === "oval"}
                  onClick={() => handleShapeTypeClick("oval")}
                >
                  <OvalShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Круг"
                  active={shapeType === "circle"}
                  onClick={() => handleShapeTypeClick("circle")}
                >
                  <CircleShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Квадрат"
                  active={shapeType === "square"}
                  onClick={() => handleShapeTypeClick("square")}
                >
                  <SquareShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Треугольник"
                  active={shapeType === "triangle"}
                  onClick={() => handleShapeTypeClick("triangle")}
                >
                  <TriangleShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Крестик"
                  active={shapeType === "cross"}
                  onClick={() => handleShapeTypeClick("cross")}
                >
                  <CrossShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Стрелка"
                  active={shapeType === "arrow"}
                  onClick={() => handleShapeTypeClick("arrow")}
                >
                  <ArrowShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Двойная стрелка"
                  active={shapeType === "doubleArrow"}
                  onClick={() => handleShapeTypeClick("doubleArrow")}
                >
                  <DoubleArrowShapeIcon />
                </ShapeButton>

                {onApplyShape ? (
                  <button
                    type="button"
                    style={wideActionButton}
                    onClick={handleApplyShape}
                    aria-label="Применить фигуру"
                    title="Применить"
                  >
                    Применить
                  </button>
                ) : null}

                <button
                  type="button"
                  style={wideActionButton}
                  onClick={handleClearShape}
                  aria-label="Убрать фигуру"
                  title="Убрать"
                >
                  Убрать
                </button>

                <button
                  type="button"
                  style={colorButton}
                  onClick={handlePaletteClick}
                  aria-label="Выбрать цвет"
                  title="Цвет"
                >
                  <span style={{ ...colorDot, background: activeColor }} />
                  <PaletteIcon />
                </button>
              </>
            ) : null}



            {settingsTool === "background" ? (
              <>
                <button
                  type="button"
                  style={colorButton}
                  onClick={handlePaletteClick}
                  aria-label="Выбрать цвет фона"
                  title="Цвет фона"
                >
                  <span
                    style={{
                      ...colorDot,
                      background:
                        activeColor === "transparent" ? "rgba(255,255,255,0.14)" : activeColor,
                    }}
                  />
                  <PaletteIcon />
                </button>

                <button
                  type="button"
                  style={wideActionButton}
                  onClick={handleClearBackgroundColor}
                  aria-label="Убрать цвет фона"
                  title="Без фона"
                >
                  Без фона
                </button>

                <label style={wideActionButton}>
                  Импорт
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundImageChange}
                    style={hiddenFileInput}
                    aria-label="Импортировать картинку для фона"
                  />
                </label>

                {hasBackgroundImage ? (
                  <button
                    type="button"
                    style={wideActionButton}
                    onClick={handleClearBackgroundImage}
                    aria-label="Убрать картинку фона"
                    title="Убрать картинку"
                  >
                    Убрать фото
                  </button>
                ) : null}
              </>
            ) : null}

            {shouldShowSizeButton && settingsTool !== "ruler" ? (
              <>
                <button
                  type="button"
                  style={{
                    ...compactActionButton,
                    ...(sizePickerOpen ? compactActionButtonActive : null),
                  }}
                  onClick={handleSizeButtonClick}
                  aria-label="Размер инструмента"
                  title="Размер"
                >
                  Размер
                </button>

                {settingsTool === "brush" ? (
                  <button
                    type="button"
                    style={colorButton}
                    onClick={handlePaletteClick}
                    aria-label="Выбрать цвет"
                    title="Цвет"
                  >
                    <span style={{ ...colorDot, background: activeColor }} />
                    <PaletteIcon />
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="bottom-toolbar-track" style={toolsGroup}>
            <ToolButton
              label="Кисть"
              active={active === "brush"}
              onClick={() => handleToolClick("brush")}
            >
              <PencilIcon />
            </ToolButton>

            <ToolButton
              label="Ластик"
              active={active === "erase"}
              onClick={() => handleToolClick("erase")}
            >
              <EraserIcon />
            </ToolButton>

            <ToolButton
              label="Передвижение"
              active={active === "move"}
              onClick={() => handleToolClick("move")}
            >
              <MoveIcon />
            </ToolButton>

            <ToolButton
              label="Кружки"
              active={active === "add" || active === "deactivate"}
              onClick={handleBeadsToolClick}
            >
              <BeadsIcon />
            </ToolButton>

            <ToolButton
              label="Линейка"
              active={active === "ruler"}
              onClick={() => handleToolClick("ruler")}
            >
              <RulerIcon />
            </ToolButton>

            <ToolButton
              label="Фигуры"
              active={active === "shape"}
              onClick={() => handleToolClick("shape")}
            >
              <ShapesIcon />
            </ToolButton>

            <ToolButton
              label="Текст"
              active={active === "text"}
              onClick={() => handleToolClick("text")}
            >
              <TextIcon />
            </ToolButton>

            <ToolButton
              label="Фон"
              active={active === "background"}
              onClick={() => handleToolClick("background")}
            >
              <BackgroundIcon />
            </ToolButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomToolbar;

const getToolName = (tool: SettingsTool) => {
  switch (tool) {
    case "brush":
      return "Кисть";
    case "erase":
      return "Ластик";
    case "beads":
      return "Кружки";
    case "ruler":
      return "Линейка";
    case "shape":
      return "Фигуры";
    case "text":
      return "Текст";
    case "background":
      return "Фон";
  }
};

const getToolIcon = (tool: SettingsTool) => {
  switch (tool) {
    case "brush":
      return <PencilIcon />;
    case "erase":
      return <EraserIcon />;
    case "beads":
      return <BeadsIcon />;
    case "ruler":
      return <RulerIcon />;
    case "shape":
      return <ShapesIcon />;
    case "text":
      return <TextIcon />;
    case "background":
      return <BackgroundIcon />;
  }
};

const ToolButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      ...toolButton,
      background: active
        ? "linear-gradient(135deg, #d9825f, #b85d6a)"
        : "rgba(255,255,255,0.08)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
      boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.16)" : "none",
      transform: "translateY(0)",
    }}
  >
    {children}
  </button>
);

const ShapeButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      ...shapeButton,
      background: active
        ? "linear-gradient(135deg, #d9825f, #b85d6a)"
        : "rgba(255,255,255,0.08)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
      boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.16)" : "none",
    }}
  >
    {children}
  </button>
);

const TextAlignButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      ...textAlignButton,
      background: active
        ? "linear-gradient(135deg, #d9825f, #b85d6a)"
        : "rgba(255,255,255,0.08)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
      boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.16)" : "none",
    }}
  >
    {children}
  </button>
);

const ModeButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      ...modeButton,
      background: active
        ? "linear-gradient(135deg, #d9825f, #b85d6a)"
        : "rgba(255,255,255,0.08)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
      boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.16)" : "none",
    }}
  >
    {children}
    <span style={modeButtonText}>{label}</span>
  </button>
);

const ChevronUpIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
    <path
      d="M8.25 18.2L15 11.45L21.75 18.2"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
    <path
      d="M8.25 11.8L15 18.55L21.75 11.8"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TextIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path
      d="M7 7.5H21"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    <path
      d="M14 7.8V20.8"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    <path
      d="M10.2 20.8H17.8"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);

const AlignLeftIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M6.5 8H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 13H17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 18H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 23H15.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const AlignCenterIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M6.5 8H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M9.5 13H18.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 18H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M10.5 23H17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const AlignRightIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M6.5 8H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M10.5 13H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 18H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M12.5 23H21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const BackgroundIcon = () => (
  <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true">
    <rect
      x="6.5"
      y="7"
      width="16"
      height="15"
      rx="3.4"
      stroke="currentColor"
      strokeWidth="2.35"
    />
    <path
      d="M8.9 19.3L12.45 15.75C13.1 15.1 14.15 15.1 14.8 15.75L16.25 17.2L17.1 16.35C17.75 15.7 18.8 15.7 19.45 16.35L22.2 19.1"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="18.55" cy="11.25" r="1.45" fill="currentColor" />
  </svg>
);

const BackIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path
      d="M17.5 7L10.5 14L17.5 21"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true">
    <path
      d="M7.1 21.9L8.45 16.35L19.75 5.05C20.72 4.08 22.28 4.08 23.25 5.05L24 5.8C24.97 6.77 24.97 8.33 24 9.3L12.7 20.6L7.1 21.9Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M17.9 6.95L22.1 11.15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6.4 24.1H22.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const AddCircleIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <circle cx="15.5" cy="15.5" r="9.8" stroke="currentColor" strokeWidth="2.35" />
    <path d="M15.5 10.8V20.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M10.8 15.5H20.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const InactiveCircleIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <circle
      cx="15.5"
      cy="15.5"
      r="9.8"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeDasharray="3.6 3.6"
    />
    <path d="M11.2 19.8L19.8 11.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const EraserIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
    <path
      d="M5.9 17.65L15.75 7.8C17.02 6.53 19.08 6.53 20.35 7.8L22.2 9.65C23.47 10.92 23.47 12.98 22.2 14.25L13.3 23.15H8.9L5.9 20.15C5.2 19.45 5.2 18.35 5.9 17.65Z"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12.55 11L19 17.45" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M13.3 23.15H24.1" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const MoveIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <path
      d="M12.15 14.9V7.8C12.15 6.85 12.9 6.1 13.85 6.1C14.8 6.1 15.55 6.85 15.55 7.8V13.2"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.55 13.2V9.45C15.55 8.5 16.3 7.75 17.25 7.75C18.2 7.75 18.95 8.5 18.95 9.45V13.55"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.95 13.55V11.35C18.95 10.45 19.66 9.72 20.56 9.72C21.47 9.72 22.2 10.45 22.2 11.35V16.6C22.2 21.05 19.2 24.9 14.9 24.9H13.85C11.75 24.9 9.9 23.78 8.9 22.02L6.6 17.98C6.1 17.12 6.38 16.02 7.22 15.5C8.03 15 9.08 15.18 9.7 15.9L12.15 18.75"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.55 7.1L6.35 9.3L8.55 11.5"
      stroke="currentColor"
      strokeWidth="2.15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22.45 5.8L24.65 8L22.45 10.2"
      stroke="currentColor"
      strokeWidth="2.15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BeadsIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <circle
      cx="11.2"
      cy="15.5"
      r="5.6"
      stroke="currentColor"
      strokeWidth="2.35"
    />
    <circle
      cx="20.2"
      cy="15.5"
      r="5.6"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeDasharray="3.2 3.2"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path
      d="M9 12V9.6C9 6.85 11.05 4.9 14 4.9C16.95 4.9 19 6.85 19 9.6V12"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="7.2"
      y="11.6"
      width="13.6"
      height="10.8"
      rx="3"
      stroke="currentColor"
      strokeWidth="2.25"
    />
    <path
      d="M14 16.1V18.2"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
    />
  </svg>
);

const UnlockIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path
      d="M9 12V9.6C9 6.85 11.05 4.9 14 4.9C16.35 4.9 18.15 6.15 18.75 8.15"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="7.2"
      y="11.6"
      width="13.6"
      height="10.8"
      rx="3"
      stroke="currentColor"
      strokeWidth="2.25"
    />
    <path
      d="M14 16.1V18.2"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
    />
  </svg>
);

const RulerTextIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M6.8 8.3H21.2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    <path d="M14 8.6V20.4" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    <path d="M10.6 20.5H17.4" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
  </svg>
);

const RulerIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <path
      d="M7.25 20.65L20.65 7.25L23.75 10.35L10.35 23.75L7.25 20.65Z"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinejoin="round"
    />
    <path d="M10.65 18.15L12.35 19.85" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M13.05 15.75L15.6 18.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M15.45 13.35L17.15 15.05" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M17.85 10.95L20.4 13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const ShapesIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <rect
      x="6.5"
      y="6.8"
      width="8.8"
      height="8.8"
      rx="2.1"
      stroke="currentColor"
      strokeWidth="2.2"
    />
    <circle
      cx="21.2"
      cy="11.2"
      r="4.4"
      stroke="currentColor"
      strokeWidth="2.2"
    />
    <path
      d="M15.5 18.1L21.8 25H9.2L15.5 18.1Z"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  </svg>
);

const OvalShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <ellipse cx="14" cy="14" rx="8.2" ry="5.9" stroke="currentColor" strokeWidth="2.45" />
  </svg>
);

const CircleShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="7.2" stroke="currentColor" strokeWidth="2.45" />
  </svg>
);

const SquareShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="7" y="7" width="14" height="14" rx="2.4" stroke="currentColor" strokeWidth="2.45" />
  </svg>
);

const TriangleShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M14 6.8L22 21H6L14 6.8Z" stroke="currentColor" strokeWidth="2.45" strokeLinejoin="round" />
  </svg>
);

const CrossShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M8 8L20 20" stroke="currentColor" strokeWidth="2.65" strokeLinecap="round" />
    <path d="M20 8L8 20" stroke="currentColor" strokeWidth="2.65" strokeLinecap="round" />
  </svg>
);

const ArrowShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M6.7 14H20.7" stroke="currentColor" strokeWidth="2.45" strokeLinecap="round" />
    <path d="M15.6 8.8L20.8 14L15.6 19.2" stroke="currentColor" strokeWidth="2.45" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DoubleArrowShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M7.2 14H20.8" stroke="currentColor" strokeWidth="2.45" strokeLinecap="round" />
    <path d="M12.3 8.9L7.2 14L12.3 19.1" stroke="currentColor" strokeWidth="2.45" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.7 8.9L20.8 14L15.7 19.1" stroke="currentColor" strokeWidth="2.45" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PaletteIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <path
      d="M15.5 5.1C9.75 5.1 5.1 9.35 5.1 14.6C5.1 19.85 9.35 24.9 15.05 24.9H16.2C17.3 24.9 18.05 23.78 17.62 22.78C17.15 21.65 17.95 20.4 19.18 20.4H20.55C23.58 20.4 25.9 18 25.9 15C25.9 9.55 21.25 5.1 15.5 5.1Z"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="10.9" cy="13.1" r="1.55" fill="currentColor" />
    <circle cx="14.9" cy="10.65" r="1.55" fill="currentColor" />
    <circle cx="19.25" cy="12.05" r="1.55" fill="currentColor" />
    <circle cx="12.9" cy="17.25" r="1.55" fill="currentColor" />
  </svg>
);

const wrapper: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 40,
  height: 78,
  minHeight: 78,
  maxHeight: 78,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  padding: 10,
  borderRadius: 28,
  background: "rgba(27,29,34,0.86)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
  overflow: "visible",
  pointerEvents: "auto",
};

const scrollArea: React.CSSProperties = {
  width: "100%",
  height: 58,
  display: "flex",
  alignItems: "center",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  touchAction: "pan-x",
  WebkitOverflowScrolling: "touch",
  overscrollBehaviorX: "contain",
  overscrollBehaviorY: "none",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  cursor: "grab",
};

const hiddenFileInput: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
};

const toolsGroup: React.CSSProperties = {
  width: "max-content",
  height: 58,
  minWidth: "max-content",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px 0 2px",
  flexWrap: "nowrap",
};

const settingsGroup: React.CSSProperties = {
  width: "max-content",
  height: 58,
  minWidth: "max-content",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px 0 2px",
  flexWrap: "nowrap",
};

const toolButton: React.CSSProperties = {
  flex: "0 0 58px",
  width: 58,
  minWidth: 58,
  height: 58,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 22,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
  color: "rgba(255,255,255,0.82)",
  background: "rgba(255,255,255,0.08)",
  WebkitTapHighlightColor: "transparent",
};

const modeButton: React.CSSProperties = {
  flex: "0 0 auto",
  minWidth: 92,
  height: 50,
  border: "1px solid rgba(255,255,255,0.08)",
  boxSizing: "border-box",
  borderRadius: 18,
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease",
  color: "rgba(255,255,255,0.82)",
  background: "rgba(255,255,255,0.08)",
  WebkitTapHighlightColor: "transparent",
};

const modeButtonText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const shapeButton: React.CSSProperties = {
  flex: "0 0 52px",
  width: 52,
  minWidth: 52,
  height: 52,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 19,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
  color: "rgba(255,255,255,0.82)",
  background: "rgba(255,255,255,0.08)",
  WebkitTapHighlightColor: "transparent",
};


const backButton: React.CSSProperties = {
  ...toolButton,
  flex: "0 0 50px",
  width: 50,
  minWidth: 50,
  height: 50,
  borderRadius: 18,
  background: "rgba(255,255,255,0.1)",
};

const activeToolBadge: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 112,
  padding: "0 14px",
  borderRadius: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  color: "#ffffff",
  background: "linear-gradient(135deg, #d9825f, #b85d6a)",
  boxShadow: "0 10px 24px rgba(208,138,106,0.24)",
};

const activeToolText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const compactActionButton: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 96,
  padding: "0 16px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const compactActionButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  boxShadow: "0 10px 24px rgba(208,138,106,0.24)",
};

const textSizeButton: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 92,
  padding: "0 12px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const textSizeButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  border: "1px solid rgba(255,255,255,0.2)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
};

const textSizeButtonLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  opacity: 0.76,
};

const textSizeButtonValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1,
};



const textPanelToggleButton: React.CSSProperties = {
  flex: "0 0 50px",
  width: 50,
  minWidth: 50,
  height: 50,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.08))",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 18px rgba(0,0,0,0.18)",
  WebkitTapHighlightColor: "transparent",
};

const textAlignControl: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 172,
  padding: "5px 6px 5px 10px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.07)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  boxSizing: "border-box",
};

const textAlignControlLabel: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const textAlignControlButtons: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const textAlignButton: React.CSSProperties = {
  flex: "0 0 36px",
  width: 36,
  minWidth: 36,
  height: 38,
  borderRadius: 13,
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const colorButton: React.CSSProperties = {
  ...toolButton,
  position: "relative",
  flex: "0 0 50px",
  width: 50,
  minWidth: 50,
  height: 50,
  borderRadius: 18,
};

const colorDot: React.CSSProperties = {
  position: "absolute",
  right: 7,
  bottom: 7,
  width: 15,
  height: 15,
  borderRadius: 999,
  border: "2px solid rgba(255,255,255,0.92)",
  boxShadow: "0 3px 10px rgba(0,0,0,0.24)",
};




const rulerTextButton: React.CSSProperties = {
  flex: "0 0 50px",
  width: 50,
  minWidth: 50,
  height: 50,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const rulerTextButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
};

const rulerLockButton: React.CSSProperties = {
  flex: "0 0 50px",
  width: 50,
  minWidth: 50,
  height: 50,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const rulerLockButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
};


const wideActionButton: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 92,
  padding: "0 16px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const floatingSizePanel: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 92,
  zIndex: 45,
  padding: "12px 12px 14px",
  borderRadius: 24,
  background: "rgba(27,29,34,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  boxShadow: "0 18px 38px rgba(0,0,0,0.28)",
  pointerEvents: "auto",
};

const floatingSizeTitle: React.CSSProperties = {
  marginBottom: 10,
  paddingLeft: 4,
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const sizePresetRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
};

const rulerSizePresetRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const rulerSizePresetButton: React.CSSProperties = {
  height: 58,
  minWidth: 0,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const rulerSizePresetButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#ffffff",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
};

const rulerSizePresetPreview: React.CSSProperties = {
  width: 42,
  borderRadius: 999,
  background: "currentColor",
  boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
};

const sizePresetButton: React.CSSProperties = {
  height: 58,
  minWidth: 0,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const sizePresetButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#ffffff",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
};

const sizePresetDotWrap: React.CSSProperties = {
  width: 34,
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
};

const sizePresetDot: React.CSSProperties = {
  display: "block",
  flex: "0 0 auto",
  borderRadius: "50%",
  background: "currentColor",
  boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
};
