import React from "react";

interface Props {
  onCreate: () => void;
}

const MenuScreen: React.FC<Props> = ({ onCreate }) => {
  return (
    <div className="menu-container">
      <h1 className="logo">Bead Pattern</h1>

      <div className="menu-buttons">
        <button onClick={onCreate}>Создать</button>
        <button>История</button>
        <button>Импортировать</button>
      </div>
    </div>
  );
};

export default MenuScreen;