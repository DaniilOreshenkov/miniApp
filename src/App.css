/* ===== RESET + FULL BLOCK SWIPE ===== */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;

  /* 🚫 УБИВАЕМ ВСЕ ЖЕСТЫ */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}

html, body {
  width: 100%;
  height: 100%;

  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background-color: var(--bg, #f2f2f7);
  color: var(--text, #111);

  /* 🚫 УБИВАЕМ SWIPE / SCROLL */
  overscroll-behavior: none;
  overflow: hidden;

  /* 🚫 УБИВАЕМ TELEGRAM EDGE SWIPE */
  position: fixed;
}

/* ===== THEME ===== */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1e;
    --card-bg: #2c2c2e;
    --text: #fff;
    --subtext: #a1a1a6;
    --input-border: #3a3a3c;
    --primary: #0a84ff;
  }
}

:root {
  --bg: #f2f2f7;
  --card-bg: #fff;
  --text: #111;
  --subtext: #6e6e73;
  --input-border: #e5e5ea;
  --primary: #0a84ff;
}

/* ===== MENU ===== */
.menu-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.logo {
  font-size: 32px;
  font-weight: 600;
  margin-bottom: 40px;
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 260px;
}

button {
  padding: 14px;
  font-size: 16px;
  border-radius: 12px;
  border: none;
  background: white;
  color: var(--text);
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: 0.2s ease;
}

button:active {
  transform: scale(0.96);
}

/* ===== CREATE SCREEN ===== */
.journal-container {
  height: 100%;
  padding: 30px 20px;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.journal-header {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
}

.journal-header h1 {
  font-size: 28px;
  font-weight: 600;
  margin: 0 auto;
}

.back-button {
  background: none;
  box-shadow: none;
  font-size: 22px;
  padding: 0;
  color: var(--text);
}

.journal-card {
  background: var(--card-bg);
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 30px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.06);
}

.journal-subtitle {
  font-size: 14px;
  color: var(--subtext);
  margin-bottom: 15px;
}

.input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.input-block {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.input-block label {
  font-size: 12px;
  color: var(--subtext);
  margin-bottom: 6px;
  text-align: center;
}

/* Stepper */
.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--input-border);
}

.stepper button {
  background: none;
  border: none;
  padding: 10px 16px;
  font-size: 20px;
  cursor: pointer;
  color: var(--text);
}

.stepper span {
  padding: 0 20px;
  font-size: 18px;
  min-width: 30px;
  text-align: center;
  color: var(--text);
}

.divider {
  font-size: 24px;
  margin: 0 15px;
  color: var(--subtext);
}

.journal-primary {
  margin-top: auto;
  padding: 16px;
  border-radius: 18px;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 16px;
  font-weight: 500;
}

/* ===== GRID ===== */
.grid-container {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg);
  overflow: hidden;
}

.grid-container .back-button {
  align-self: flex-start;
  margin-bottom: 20px;
}

.grid {
  display: grid;
  gap: 4px;

  /* 🚫 ВАЖНО: убираем свайп на сетке */
  touch-action: none;
}

.grid-cell {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #ccc;

  /* 🚫 никакой жест не проходит */
  touch-action: none;
}