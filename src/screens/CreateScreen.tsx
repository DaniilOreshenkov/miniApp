import React, { useState } from "react";

interface Props {
  onBack: () => void;
  onCreate: (params: {
    width: number;
    height: number;
    wallHeight: number;
    beadSize: string;
  }) => void;
}

const beadSizes = ["6 мм", "8 мм"];

const CreateScreen: React.FC<Props> = ({ onBack, onCreate }) => {
  const [width, setWidth] = useState<number>(10);
  const [height, setHeight] = useState<number>(8);
  const [wallHeight, setWallHeight] = useState<number>(9);
  const [beadSizeIndex, setBeadSizeIndex] = useState<number>(1); // 0 = 6мм, 1 = 8мм

  return (
    <div className="journal-container">
      <div className="journal-header">
        <button className="back-button" onClick={onBack}>
          ←
        </button>
        <h1>Новая схема</h1>
      </div>

      <div className="journal-card">
        <p className="journal-subtitle">Параметры схемы</p>

        {/* Ширина и Высота */}
        <div className="input-row">
          <div className="input-block">
            <label>Ширина</label>
            <div className="stepper">
              <button onClick={() => setWidth(Math.max(1, width - 1))}>−</button>
              <span>{width}</span>
              <button onClick={() => setWidth(width + 1)}>+</button>
            </div>
          </div>

          <div className="divider">×</div>

          <div className="input-block">
            <label>Высота</label>
            <div className="stepper">
              <button onClick={() => setHeight(Math.max(1, height - 1))}>−</button>
              <span>{height}</span>
              <button onClick={() => setHeight(height + 1)}>+</button>
            </div>
          </div>
        </div>

        {/* Высота стенки */}
        <div className="input-row" style={{ marginTop: "20px" }}>
          <div className="input-block">
            <label>Высота стенки</label>
            <div className="stepper">
              <button onClick={() => setWallHeight(Math.max(1, wallHeight - 1))}>−</button>
              <span>{wallHeight}</span>
              <button onClick={() => setWallHeight(wallHeight + 1)}>+</button>
            </div>
          </div>

          <div className="divider" style={{ visibility: "hidden" }}>×</div>

          {/* Размер бусины */}
          <div className="input-block">
            <label>Размер бусины</label>
            <div className="stepper">
              <button
                onClick={() =>
                  setBeadSizeIndex((prev) => (prev === 0 ? beadSizes.length - 1 : prev - 1))
                }
              >
                −
              </button>
              <span>{beadSizes[beadSizeIndex]}</span>
              <button
                onClick={() =>
                  setBeadSizeIndex((prev) => (prev === beadSizes.length - 1 ? 0 : prev + 1))
                }
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        className="journal-primary"
        onClick={() =>
          onCreate({
            width,
            height,
            wallHeight,
            beadSize: beadSizes[beadSizeIndex],
          })
        }
      >
        Создать схему
      </button>
    </div>
  );
};

export default CreateScreen;