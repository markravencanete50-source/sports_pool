/**
 * Minimal Markdown → docx renderer.
 *
 * WHY THIS EXISTS. The operations runbook lives in docs/RUNBOOK.md because that
 * is where an engineer on call will actually look for it — in the repository,
 * greppable, versioned with the code it describes. But the client receives a
 * single document, and a handover that says "the incident procedures are in a
 * markdown file somewhere" is a handover with a hole in it.
 *
 * So the runbook stays the source of truth in Markdown, and this renders it into
 * the combined document at generation time. Edit RUNBOOK.md and the bound copy
 * updates with it — there is no second copy to drift, which is the same property
 * the other five parts already have.
 *
 * SCOPE, DELIBERATELY SMALL. This supports exactly the Markdown the runbook
 * uses: headings, tables, fenced code, bullets, numbered lists, blockquotes, and
 * inline bold/code. It is not a general Markdown implementation and should not
 * grow into one — if a document needs more than this, the honest answer is a
 * real converter, not another hundred lines of regex here. Anything it does not
 * recognise renders as plain text rather than being silently dropped, so a
 * missed feature is visible in the output instead of quietly absent.
 */

const {
  Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} = require("docx");

const NAVY = "1F3864";
const BLUE = "2E4A7A";
const GREY = "595959";
const MONO = "Consolas";

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};

/**
 * Inline formatting → TextRun[]. Handles **bold** and `code`, which is all the
 * runbook uses. Splitting on a single alternating regex keeps the order of runs
 * correct without a nested parser.
 */
function inline(text, base = {}) {
  const runs = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), size: 20, ...base }));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), size: 20, bold: true, ...base }));
    } else {
      runs.push(new TextRun({
        text: token.slice(1, -1),
        font: MONO,
        size: 17,
        color: "1A4D2E",
        ...base,
      }));
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), size: 20, ...base }));
  }
  // A genuinely empty line still needs a run, or docx renders nothing at all.
  return runs.length ? runs : [new TextRun({ text: "", size: 20, ...base })];
}

const heading = (text, level) =>
  new Paragraph({
    heading:
      level === 1 ? HeadingLevel.HEADING_1
      : level === 2 ? HeadingLevel.HEADING_2
      : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 320 : level === 2 ? 260 : 180, after: level === 1 ? 150 : 100 },
    children: [new TextRun({
      text,
      size: level === 1 ? 30 : level === 2 ? 25 : 21,
      bold: true,
      color: level === 1 ? NAVY : level === 2 ? BLUE : "3A3A3A",
      font: "Calibri",
    })],
  });

const codeBlock = (lines) =>
  lines.map((ln, i) => new Paragraph({
    spacing: { after: i === lines.length - 1 ? 130 : 0, line: 236 },
    shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color: "C4CDD5", space: 8 } },
    children: [new TextRun({ text: ln.length ? ln : " ", font: MONO, size: 17, color: "24292E" })],
  }));

/** `| a | b |` rows, with the `|---|` separator row dropped. */
function renderTable(rows) {
  const parse = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const parsed = rows.map(parse).filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c)));
  if (parsed.length === 0) return [];

  const colCount = Math.max(...parsed.map((r) => r.length));
  const width = Math.floor(8900 / colCount);

  return [new Table({
    width: { size: 8900, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(width),
    rows: parsed.map((cells, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: Array.from({ length: colCount }, (_, i) => {
        const content = cells[i] ?? "";
        return new TableCell({
          width: { size: width, type: WidthType.DXA },
          borders: CELL_BORDERS,
          shading: rowIndex === 0
            ? { type: ShadingType.CLEAR, fill: NAVY }
            : rowIndex % 2 === 0
              ? { type: ShadingType.CLEAR, fill: "F4F6FA" }
              : undefined,
          margins: { top: 60, bottom: 60, left: 95, right: 95 },
          children: [new Paragraph({
            spacing: { after: 0, line: 254 },
            children: rowIndex === 0
              ? [new TextRun({ text: content.replace(/\*\*/g, ""), size: 18, bold: true, color: "FFFFFF" })]
              : inline(content, { size: 18 }),
          })],
        });
      }),
    })),
  })];
}

/** Render a Markdown string into an array of docx elements. */
function renderMarkdown(markdown) {
  const out = [];
  const lines = markdown.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (/^```/.test(line.trim())) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++; // closing fence
      out.push(...codeBlock(body));
      continue;
    }

    // Table: a pipe row followed by a separator row
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:-]*\|/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(...renderTable(rows));
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      out.push(heading(h[2].trim(), h[1].length));
      i++;
      continue;
    }

    // Blockquote — rendered as an indented, tinted note.
    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(new Paragraph({
        spacing: { before: 80, after: 130, line: 274 },
        indent: { left: 300 },
        shading: { type: ShadingType.CLEAR, fill: "FBF3E6" },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: "B8860B", space: 10 } },
        children: inline(body.join(" ").trim()),
      }));
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push(new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 85, line: 272 },
        children: inline(bullet[1]),
      }));
      i++;
      continue;
    }

    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      out.push(new Paragraph({
        numbering: { reference: "n", level: 0 },
        spacing: { after: 95, line: 272 },
        children: inline(numbered[1]),
      }));
      i++;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) { i++; continue; } // horizontal rule
    if (line.trim() === "") { i++; continue; }

    out.push(new Paragraph({
      spacing: { after: 130, line: 280 },
      children: inline(line.trim()),
    }));
    i++;
  }

  return out;
}

module.exports = { renderMarkdown };
