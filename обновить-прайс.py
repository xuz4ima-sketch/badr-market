# Пересобирает site/data/prices.js из site/data/prices.csv.
# Нужен, чтобы прайс открывался даже при запуске index.html двойным щелчком.
# Запуск: python обновить-прайс.py
import json, pathlib
root = pathlib.Path(__file__).parent / "site" / "data"
csv = (root / "prices.csv").read_text(encoding="utf-8-sig")
(root / "prices.js").write_text(
    "// Создаётся автоматически из prices.csv скриптом обновить-прайс.py. Не редактируйте вручную.\n"
    "window.BADR_PRICES_CSV = " + json.dumps(csv, ensure_ascii=False) + ";\n",
    encoding="utf-8")
print("Готово:", root / "prices.js")
