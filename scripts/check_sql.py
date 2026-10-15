"""Проверка SQL-миграций WFOOD на структурные ошибки.

Не заменяет запуск на реальном Postgres, но ловит типичные опечатки:
несбалансированные скобки, незакрытые $$-блоки, забытые точки с запятой.
"""

import re
import sys
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parent.parent / "supabase" / "migrations"


def strip_noise(sql: str) -> str:
    """Убирает комментарии и строковые литералы, чтобы не считать скобки в них."""
    sql = re.sub(r"--[^\n]*", "", sql)
    sql = re.sub(r"'(?:[^']|'')*'", "''", sql)
    return sql


def check_file(path: Path) -> list[str]:
    problems: list[str] = []
    raw = path.read_text(encoding="utf-8")

    # Баланс $$ (используется для DO-блоков и bodies функций)
    dollar_count = raw.count("$$")
    if dollar_count % 2 != 0:
        problems.append(f"несбалансированные $$: найдено {dollar_count} (должно быть чётным)")

    sql = strip_noise(raw)
    # $$-блоки заменяем заглушкой — внутри них свой синтаксис
    sql_flat = re.sub(r"\$\$.*?\$\$", " BLOCK ", sql, flags=re.S)

    opens = sql_flat.count("(")
    closes = sql_flat.count(")")
    if opens != closes:
        problems.append(f"несбалансированные скобки: {opens} открывающих, {closes} закрывающих")

    # BEGIN/END: в plpgsql их должно быть поровну (IF ... THEN ... END IF тоже даёт END)
    begins = len(re.findall(r"\bbegin\b", sql_flat, re.I))
    ends = len(re.findall(r"\bend\b", sql_flat, re.I))
    if begins > ends:
        problems.append(f"BEGIN ({begins}) больше END ({ends}) — вероятно, не закрыт блок")
    if ends > begins:
        # END IF / END LOOP тоже считаются, поэтому END может законно превышать BEGIN
        pass

    # Каждый оператор верхнего уровня должен заканчиваться ';'
    for statement in re.finditer(r"^(create|alter|drop|grant|comment|analyze)\b", sql_flat, re.I | re.M):
        tail = sql_flat[statement.start():]
        # Ищем конец оператора
        if ";" not in tail:
            line = sql_flat[: statement.start()].count("\n") + 1
            problems.append(f"строка ~{line}: оператор без завершающей ';'")

    return problems


def summarize(path: Path) -> None:
    sql = strip_noise(path.read_text(encoding="utf-8"))
    tables = re.findall(r"create table if not exists\s+([\w.]+)", sql, re.I)
    policies = re.findall(r"create policy\s+(\w+)", sql, re.I)
    indexes = re.findall(r"create index if not exists\s+(\w+)", sql, re.I)
    functions = re.findall(r"create or replace function\s+([\w.]+)", sql, re.I)

    print(f"  таблиц: {len(tables)}")
    if tables:
        print(f"    {', '.join(t.split('.')[-1] for t in tables)}")
    if policies:
        print(f"  политик RLS: {len(policies)}")
    if indexes:
        print(f"  индексов: {len(indexes)}")
    if functions:
        print(f"  функций: {len(functions)} -> {', '.join(f.split('.')[-1] for f in functions)}")


def main() -> int:
    failed = False
    for path in sorted(MIGRATIONS.glob("*.sql")):
        print(f"\n=== {path.name} ===")
        summarize(path)
        problems = check_file(path)
        if problems:
            failed = True
            print("  ПРОБЛЕМЫ:")
            for p in problems:
                print(f"    - {p}")
        else:
            print("  структура: OK")

    print()
    if failed:
        print("Найдены проблемы — проверьте миграции перед применением.")
        return 1
    print("Все миграции структурно корректны.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
