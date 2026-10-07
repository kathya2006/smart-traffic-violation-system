#!/usr/bin/env python3
"""
Generates the ER diagram straight from database/schema.sql so the diagram can
never drift from the real schema.

  python3 docs/generate_er.py

Outputs
  docs/er-diagram.svg          (dark neon theme, also served by the web app)
  docs/er-diagram.png
  frontend/assets/er-diagram.svg
  docs/ER_DIAGRAM.md           (Mermaid erDiagram + table dictionary)

Needs Graphviz (`dot`) on the PATH.
"""
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "database" / "schema.sql"

# ------------------------------------------------------------------ parse
sql = SCHEMA.read_text(encoding="utf-8")
tables = {}      # name -> dict(columns=[], pk=[], fks=[], uniques=set())
order = []

for m in re.finditer(r"CREATE TABLE (\w+) \((.*?)\n\) ENGINE", sql, re.S):
    name, body = m.group(1), m.group(2)
    t = {"columns": [], "pk": [], "fks": [], "unique": set()}
    for raw in body.split("\n"):
        line = raw.strip().rstrip(",")
        if not line or line.startswith("--"):
            continue
        if line.startswith("PRIMARY KEY"):
            t["pk"] = [c.strip() for c in re.search(r"\((.*?)\)", line).group(1).split(",")]
        elif line.startswith("UNIQUE KEY"):
            cols = [c.strip() for c in re.search(r"\((.*?)\)", line).group(1).split(",")]
            if len(cols) == 1:
                t["unique"].add(cols[0])
        elif line.startswith("CONSTRAINT") and "FOREIGN KEY" in line:
            fm = re.search(r"FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)", line)
            t["fks"].append((fm.group(1), fm.group(2), fm.group(3)))
        elif line.startswith(("KEY", "CONSTRAINT")):
            continue
        else:
            cm = re.match(r"(\w+)\s+(ENUM\([^)]*\)|[A-Za-z]+(?:\([^)]*\))?(?:\s+UNSIGNED)?)(.*)", line)
            if cm:
                col, typ, rest = cm.group(1), cm.group(2), cm.group(3)
                t["columns"].append({
                    "name": col,
                    "type": typ,
                    "notnull": "NOT NULL" in rest,
                    "generated": "GENERATED" in rest,
                })
    tables[name] = t
    order.append(name)

fk_cols = {n: {c for c, _, _ in t["fks"]} for n, t in tables.items()}

# ------------------------------------------------------------------ groups / colours
GROUPS = {
    "People & stations": (["police_stations", "users", "officers", "notifications"], "#00e5ff"),
    "Vehicles & owners": (["owners", "vehicle_types", "vehicles"], "#7c4dff"),
    "Rulebook & places": (["violation_categories", "violation_types", "locations"], "#ffb020"),
    "Violation workflow": (["violations", "violation_evidence", "violation_status_history", "appeals"], "#ff3d71"),
    "Fines & payments": (["fines", "payments"], "#00e676"),
}
colour = {}
for _, (members, c) in GROUPS.items():
    for mname in members:
        colour[mname] = c


def short_type(t):
    t = t.upper()
    if t.startswith("ENUM"):
        return "ENUM"
    t = re.sub(r"\s+UNSIGNED", "", t)
    return t


# ------------------------------------------------------------------ DOT
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


dot = []
dot.append('digraph ER {')
dot.append('  graph [bgcolor="#060a18", rankdir=LR, splines=true, nodesep=0.35, ranksep=1.8, pad=0.5, fontname="Helvetica",'
           ' label=<<FONT COLOR="#9fb4ff" POINT-SIZE="26"><B>Smart Traffic Violation Reporting System</B></FONT><BR/>'
           '<FONT COLOR="#6b7bb3" POINT-SIZE="15">Entity-Relationship Diagram  |  generated from database/schema.sql</FONT>>,'
           ' labelloc=t, labeljust=l, newrank=true];')
dot.append('  node  [shape=plain, fontname="Helvetica"];')
dot.append('  edge  [color="#5b6bff", penwidth=1.4, arrowsize=1.0, fontname="Helvetica", fontsize=10, fontcolor="#7f90d0"];')

for name in order:
    t = tables[name]
    c = colour.get(name, "#9fb4ff")
    rows = []
    rows.append(f'<TR><TD COLSPAN="3" BGCOLOR="{c}" ALIGN="LEFT" CELLPADDING="7"><FONT COLOR="#060a18" POINT-SIZE="15"><B>{esc(name)}</B></FONT></TD></TR>')
    for col in t["columns"]:
        cn = col["name"]
        tags = []
        if cn in t["pk"]:
            tags.append("PK")
        if cn in fk_cols[name]:
            tags.append("FK")
        if cn in t["unique"] and cn not in t["pk"] and cn not in fk_cols[name]:
            tags.append("UQ")
        tag = ",".join(tags) or "&nbsp;"
        tag_col = "#ffd166" if "PK" in tags else "#4fc3ff" if "FK" in tags else "#8be9a8"
        name_col = "#ffffff" if "PK" in tags else "#cfd8ff"
        weight = "<B>%s</B>" if "PK" in tags else "%s"
        shown = weight % esc(cn)
        if not col["notnull"] and cn not in t["pk"] and not col["generated"]:
            shown += ' <FONT COLOR="#59679c">?</FONT>'
        rows.append(
            f'<TR><TD ALIGN="LEFT" PORT="{cn}" CELLPADDING="3"><FONT COLOR="{name_col}" POINT-SIZE="12">{shown}</FONT></TD>'
            f'<TD ALIGN="LEFT" CELLPADDING="3"><FONT COLOR="#6f7fb8" POINT-SIZE="10">{esc(short_type(col["type"]))}</FONT></TD>'
            f'<TD ALIGN="RIGHT" CELLPADDING="3"><FONT COLOR="{tag_col}" POINT-SIZE="10"><B>{tag}</B></FONT></TD></TR>'
        )
    label = ('<<TABLE BORDER="1" COLOR="%s" CELLBORDER="0" CELLSPACING="0" BGCOLOR="#0d1430" STYLE="rounded">' % c
             + "".join(rows) + "</TABLE>>")
    dot.append(f'  {name} [label={label}];')

for child in order:
    t = tables[child]
    for col, parent, pcol in t["fks"]:
        nullable = not next(c for c in t["columns"] if c["name"] == col)["notnull"]
        one_to_one = col in t["unique"]
        # head = parent side, tail = child side (edge drawn child -> parent)
        head = "teeodot" if nullable else "teetee"
        tail = "teeodot" if one_to_one else "crowodot"
        dot.append(f'  {child} -> {parent} [arrowhead={head}, arrowtail={tail}, dir=both,'
                   f' color="{colour.get(parent, "#5b6bff")}b0", tooltip="{child}.{col} -> {parent}.{pcol}"];')

# legend
dot.append('  legend [label=<<TABLE BORDER="1" COLOR="#2a3566" CELLBORDER="0" CELLSPACING="0" BGCOLOR="#0a1028" STYLE="rounded">'
           '<TR><TD ALIGN="LEFT"><FONT COLOR="#9fb4ff" POINT-SIZE="13"><B>Legend</B></FONT></TD></TR>'
           '<TR><TD ALIGN="LEFT"><FONT COLOR="#ffd166" POINT-SIZE="11"><B>PK</B></FONT><FONT COLOR="#cfd8ff" POINT-SIZE="11">  primary key</FONT></TD></TR>'
           '<TR><TD ALIGN="LEFT"><FONT COLOR="#4fc3ff" POINT-SIZE="11"><B>FK</B></FONT><FONT COLOR="#cfd8ff" POINT-SIZE="11">  foreign key</FONT></TD></TR>'
           '<TR><TD ALIGN="LEFT"><FONT COLOR="#8be9a8" POINT-SIZE="11"><B>UQ</B></FONT><FONT COLOR="#cfd8ff" POINT-SIZE="11">  unique</FONT></TD></TR>'
           '<TR><TD ALIGN="LEFT"><FONT COLOR="#59679c" POINT-SIZE="11">?</FONT><FONT COLOR="#cfd8ff" POINT-SIZE="11">  nullable column</FONT></TD></TR>'
           '<TR><TD ALIGN="LEFT"><FONT COLOR="#cfd8ff" POINT-SIZE="11">crow-foot = many, bar = one, circle = optional</FONT></TD></TR>'
           '</TABLE>>];')
dot.append('}')
dot_text = "\n".join(dot)

dot_path = ROOT / "docs" / "er-diagram.dot"
dot_path.write_text(dot_text, encoding="utf-8")

if not shutil.which("dot"):
    raise SystemExit("Graphviz 'dot' not found - install graphviz to render the diagram")

svg_path = ROOT / "docs" / "er-diagram.svg"
png_path = ROOT / "docs" / "er-diagram.png"
subprocess.run(["dot", "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True)
subprocess.run(["dot", "-Tpng", "-Gdpi=110", str(dot_path), "-o", str(png_path)], check=True)
shutil.copyfile(svg_path, ROOT / "frontend" / "assets" / "er-diagram.svg")
dot_path.unlink()  # keep the repo clean; svg/png are the artefacts

# ------------------------------------------------------------------ Mermaid + dictionary
def m_type(t):
    base = re.sub(r"\(.*", "", short_type(t)).lower().strip()
    return {"tinyint": "int", "smallint": "int", "char": "varchar"}.get(base, base)


mer = ["erDiagram"]
for name in order:
    t = tables[name]
    mer.append(f"  {name} {{")
    for col in t["columns"]:
        keys = []
        if col["name"] in t["pk"]:
            keys.append("PK")
        if col["name"] in fk_cols[name]:
            keys.append("FK")
        if col["name"] in t["unique"] and not keys:
            keys.append("UK")
        mer.append(f"    {m_type(col['type'])} {col['name']}" + (f" {','.join(keys)}" if keys else ""))
    mer.append("  }")
for child in order:
    t = tables[child]
    for col, parent, _ in t["fks"]:
        nullable = not next(c for c in t["columns"] if c["name"] == col)["notnull"]
        left = "|o" if nullable else "||"
        right = "o|" if col in t["unique"] else "o{"
        mer.append(f'  {parent} {left}--{right} {child} : "{col}"')

dictionary = []
for name in order:
    t = tables[name]
    dictionary.append(f"### `{name}`")
    dictionary.append("")
    dictionary.append("| Column | Type | Key | Null |")
    dictionary.append("|---|---|---|---|")
    for col in t["columns"]:
        key = []
        if col["name"] in t["pk"]:
            key.append("PK")
        for c, p, pc in t["fks"]:
            if c == col["name"]:
                key.append(f"FK -> {p}.{pc}")
        if col["name"] in t["unique"] and "PK" not in key:
            key.append("UNIQUE")
        nul = "no" if (col["notnull"] or col["name"] in t["pk"] or col["generated"]) else "yes"
        dictionary.append(f"| `{col['name']}` | {short_type(col['type'])} | {', '.join(key)} | {nul} |")
    dictionary.append("")

md = f"""# Entity-Relationship Diagram

> Generated from [`database/schema.sql`](../database/schema.sql) by `docs/generate_er.py`.
> Re-run `python3 docs/generate_er.py` after changing the schema.

![ER diagram](er-diagram.png)

*(Vector version: [`er-diagram.svg`](er-diagram.svg). The same diagram is shown live inside the web app on the **Database** page.)*

## Relationships

| Parent (one) | Child (many) | Via | Meaning |
|---|---|---|---|
| `police_stations` | `officers` | `station_id` | A station has many officers |
| `users` | `officers` | `user_id` (unique) | An officer account extends exactly one user (1 : 1) |
| `owners` | `vehicles` | `owner_id` | An owner can hold many vehicles |
| `vehicle_types` | `vehicles` | `vehicle_type_id` | Classification of vehicles |
| `violation_categories` | `violation_types` | `category_id` | Rulebook grouped into categories |
| `vehicles` | `violations` | `vehicle_id` | A vehicle can be reported many times |
| `violation_types` | `violations` | `violation_type_id` | Which offence was committed |
| `locations` | `violations` | `location_id` | Where it happened |
| `users` | `violations` | `reported_by` | Who reported it (citizen / officer / admin) |
| `officers` | `violations` | `assigned_officer_id` | Officer handling the case (optional) |
| `violations` | `violation_evidence` | `violation_id` | Photos / proof attached to a case |
| `violations` | `fines` | `violation_id` (unique) | A verified violation has at most one fine (1 : 0..1) |
| `fines` | `payments` | `fine_id` | A fine can be settled in one or more payments |
| `violations` | `appeals` | `violation_id` | Owner disputes of a violation |
| `violations` | `violation_status_history` | `violation_id` | Audit trail of every status change |
| `users` | `notifications` | `user_id` | In-app notifications |

## Normalisation

* **1NF** - every column is atomic; no repeating groups (evidence, payments, appeals and history live in their own tables).
* **2NF** - every non-key attribute depends on the whole primary key (all tables use a single-column surrogate key).
* **3NF** - no transitive dependencies: vehicle details live in `vehicles`, owner details in `owners`, fine amounts in `violation_types`/`fines`, place data in `locations`, category data in `violation_categories`. `violations` stores only keys and facts about the incident itself.

## Database objects beyond tables

| Object | Purpose |
|---|---|
| `v_violation_details` | Flat, joined view used by the list / detail screens |
| `v_vehicle_offence_summary` | Per-vehicle totals: violations, penalty points, fines, outstanding amount |
| `sp_issue_fine(violation_id)` | Computes and inserts the fine (base fine + over-speed surcharge), idempotent |
| `trg_violations_bi` | Rejects violations dated in the future |
| `trg_violations_ai` / `trg_violations_au` | Write the audit trail into `violation_status_history` |
| `trg_payments_ai` | Marks the fine **Paid** and closes the violation once fully paid |
| `fines.total_due` | Generated column (`amount + late_fee`) |
| `CHECK` constraints | Non-negative fines, penalty points <= 12, valid latitude / longitude |

## Mermaid version (renders natively on GitHub)

```mermaid
{chr(10).join(mer)}
```

## Data dictionary

{chr(10).join(dictionary)}
"""
(ROOT / "docs" / "ER_DIAGRAM.md").write_text(md, encoding="utf-8")
print(f"ER diagram generated: {len(order)} tables, {sum(len(t['fks']) for t in tables.values())} relationships")
