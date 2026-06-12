#!/bin/bash
# beadly — конвертация SVG → PNG
# Запускать из папки bot-assets:  bash make-png.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "▸ Конвертирую аватарку (512×512)..."
qlmanage -t -s 512 avatar.svg -o . 2>/dev/null
[ -f "avatar.svg.png" ] && mv "avatar.svg.png" "avatar.png" && echo "  ✓ avatar.png"

echo "▸ Конвертирую баннер welcome (1280×640)..."
qlmanage -t -s 1280 banner-welcome.svg -o . 2>/dev/null
[ -f "banner-welcome.svg.png" ] && mv "banner-welcome.svg.png" "banner-welcome.png" && echo "  ✓ banner-welcome.png"

echo "▸ Конвертирую баннер update (1280×480)..."
qlmanage -t -s 1280 banner-update.svg -o . 2>/dev/null
[ -f "banner-update.svg.png" ] && mv "banner-update.svg.png" "banner-update.png" && echo "  ✓ banner-update.png"

echo "▸ Конвертирую баннер promo (1280×480)..."
qlmanage -t -s 1280 banner-promo.svg -o . 2>/dev/null
[ -f "banner-promo.svg.png" ] && mv "banner-promo.svg.png" "banner-promo.png" && echo "  ✓ banner-promo.png"

# Проверяем результат
DONE=0
for f in avatar.png banner-welcome.png banner-update.png banner-promo.png; do
  [ -f "$f" ] && DONE=$((DONE+1))
done

echo ""
if [ $DONE -eq 4 ]; then
  echo "✅ Готово — $DONE PNG файла в папке bot-assets"
  open "$DIR"
else
  echo "⚠️  qlmanage не сработал ($DONE/4). Пробую через Python..."
  python3 - <<'PYEOF'
import subprocess, os, sys

svgs = [
  ("avatar.svg", "avatar.png"),
  ("banner-welcome.svg", "banner-welcome.png"),
  ("banner-update.svg", "banner-update.png"),
  ("banner-promo.svg", "banner-promo.png"),
]

ok = 0
for src, dst in svgs:
  if not os.path.exists(src):
    print(f"  ✗ {src} не найден")
    continue
  # попытка через cairosvg
  try:
    import cairosvg
    cairosvg.svg2png(url=src, write_to=dst)
    print(f"  ✓ {dst} (cairosvg)")
    ok += 1
    continue
  except ImportError:
    pass
  # попытка через Pillow + svglib
  try:
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM
    drawing = svg2rlg(src)
    renderPM.drawToFile(drawing, dst, fmt="PNG")
    print(f"  ✓ {dst} (svglib)")
    ok += 1
    continue
  except ImportError:
    pass
  print(f"  ✗ {src} — нет библиотек")

if ok == 0:
  print("\n💡 Установи cairosvg:  pip3 install cairosvg")
  print("   Затем снова:  bash make-png.sh")
else:
  print(f"\n✅ Готово — {ok} файлов")
  subprocess.run(["open", "."])
PYEOF
fi
