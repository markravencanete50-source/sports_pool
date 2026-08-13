/**
 * The complete documentation set, as one document.
 *
 * WHY THIS EXISTS. Five separate .docx files is five things to email, five
 * things to version, and five chances for someone to read the wrong one. This
 * project has already been bitten twice by a document that read as current and
 * was not. One file, generated from the same sources, removes that failure mode
 * for anyone who would rather hand over a single artefact.
 *
 * HOW IT WORKS. It does not copy or re-state any content. Each generator now
 * exports its `children` array when required as a module and still writes its
 * own file when run directly, so this script imports the real thing. Edit a
 * source generator and both the individual document and this combined one
 * change together — there is no second copy to drift.
 *
 * The parts are ordered so a reader can start at the top and stop when they
 * have what they need: what the system is, then the plain-English explanation,
 * then the technical detail, then the findings.
 */

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, LevelFormat, Header, Footer, PageNumber,
} = require("docx");
const fs = require("fs");

const NAVY = "1F3864";
const BLUE = "2E4A7A";
const GREY = "595959";

/**
 * Every numbering reference used by any source generator. They were written
 * independently and each invented its own names; the combined document needs
 * the union or a bullet silently renders unnumbered.
 */
const NUMBERING = [
  { reference: "b", levels: [
    { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 250 } } } },
    { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 880, hanging: 250 } } } },
  ]},
  { reference: "n", levels: [
    { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 300 } } } },
  ]},
  { reference: "dots", levels: [
    { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } },
  ]},
  { reference: "steps", levels: [
    { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 300 } } } },
  ]},
  { reference: "bullets", levels: [
    { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } },
    { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 920, hanging: 260 } } } },
  ]},
];

const PARTS = [
  {
    n: "I",
    title: "Project Handover",
    blurb: "What the system is, how it is built, and the checklist to take it live. Start here. Section 10 is the client's task list.",
    module: "./gen-handover-doc.cjs",
  },
  {
    n: "II",
    title: "The Backend, Explained Simply",
    blurb: "The same system in plain English, for a reader who does not write software. No jargon and no code.",
    module: "./gen-backend-explainer.cjs",
  },
  {
    n: "III",
    title: "Backend Architecture & Security Reference",
    blurb: "The technical companion: threat model as attack, control and layer; the endpoint inventory with its auth posture; the security-relevant tables.",
    module: "./gen-backend-technical.cjs",
  },
  {
    n: "IV",
    title: "Backend Security Audit Report",
    blurb: "The security cycle: what was found, what was fixed, and the attacks the system was subjected to and withstood.",
    module: "./gen-security-report.cjs",
  },
  {
    n: "V",
    title: "Full-Stack Audit",
    blurb: "The findings record across frontend, backend, database and operations. Section 9 is the gap checklist; Section 13 states what remains and whose job it is.",
    module: "./gen-fullstack-audit.cjs",
  },
];

const P = (text, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 130, line: 280 },
  alignment: o.align,
  children: [new TextRun({ text, size: o.size ?? 21, color: o.color ?? "222222", bold: o.bold, italics: o.italics, font: "Calibri" })],
});

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};

function kv(rows) {
  const w = [2200, 6600];
  return new Table({
    width: { size: 8800, type: WidthType.DXA }, columnWidths: w,
    rows: rows.map((r, i) => new TableRow({
      children: [
        new TableCell({
          width: { size: w[0], type: WidthType.DXA }, borders: cellBorders,
          shading: { type: ShadingType.CLEAR, fill: "F2F5F9" },
          margins: { top: 60, bottom: 60, left: 95, right: 95 },
          children: [new Paragraph({ children: [new TextRun({ text: r[0], bold: true, size: 18, font: "Calibri" })] })],
        }),
        new TableCell({
          width: { size: w[1], type: WidthType.DXA }, borders: cellBorders,
          shading: i % 2 ? { type: ShadingType.CLEAR, fill: "FAFBFD" } : undefined,
          margins: { top: 60, bottom: 60, left: 95, right: 95 },
          children: [new Paragraph({ children: [new TextRun({ text: r[1], size: 18, font: "Calibri" })] })],
        }),
      ],
    })),
  });
}

/** Divider announcing each part, so the reader always knows where they are. */
function partDivider(part) {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      spacing: { before: 2200, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `PART ${part.n}`, size: 26, bold: true, color: GREY, font: "Calibri" })],
    }),
    new Paragraph({
      spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 10, color: NAVY, space: 14 } },
      children: [new TextRun({ text: part.title, size: 46, bold: true, color: NAVY, font: "Calibri" })],
    }),
    new Paragraph({
      spacing: { before: 240, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: part.blurb, size: 21, italics: true, color: GREY, font: "Calibri" })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Assemble ────────────────────────────────────────────────────────────────
const children = [];

// Cover
children.push(
  new Paragraph({ spacing: { before: 1500, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron", bold: true, size: 72, color: NAVY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 90, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "NFL Sports Pool Platform", size: 34, color: BLUE, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 160, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Complete Documentation", size: 30, color: GREY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 50, after: 460 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Handover · Architecture · Security · Audit · Operations", size: 21, italics: true, color: GREY, font: "Calibri" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 160, after: 300 }, children: [new TextRun({ text: "", size: 2 })] }),
);
children.push(kv([
  ["Document", "Every project document in one file, generated from the same sources as the individual ones"],
  ["Date", "13 August 2026"],
  ["Repository", "markravencanete50-source/sports_pool"],
  ["Product", "Real-money NFL prediction pools (parlay cards, prize pots, payouts)"],
  ["Stack", "Next.js 16.3 · TypeScript 6 · Supabase (Postgres + RLS) · Stripe · PayPal · Vercel"],
  ["Scale", "53 API routes · 34 migrations · 26 tables · 63 components · ~25,700 lines TS/TSX"],
  ["Production", "Deployed and verified live; 13 of 13 end-to-end assertions pass against it"],
  ["Regenerate", "npm run docs:combined"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// Reading guide
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
  children: [new TextRun({ text: "How to read this", size: 32, bold: true, color: NAVY, font: "Calibri" })],
}));
children.push(P("Five documents, bound in one file. Each part was written for a different reader, so nobody needs to read all of it."));
children.push(kv(PARTS.map((p) => [`Part ${p.n} — ${p.title}`, p.blurb])));
children.push(P(""));
children.push(P("If you are handing this project to a client: Part I section 10 and the operations runbook (docs/RUNBOOK.md, section 3) are the entire technical task. Everything else is reference.", { italics: true }));
children.push(P("If you are the engineer receiving it: read Part I for the shape of the system, then Part III for the security model, then Part V section 13 for what is genuinely outstanding.", { italics: true }));
children.push(P(""));
children.push(P("Nothing here is a copy. Each part is imported from the generator that produces the standalone document, so the two can never disagree — change a source and both update.", { italics: true, color: GREY }));

// Parts
for (const part of PARTS) {
  const body = require(part.module);
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error(`${part.module} exported nothing — check its module.exports guard`);
  }
  children.push(...partDivider(part));
  children.push(...body);
  console.log(`  Part ${part.n.padEnd(3)} ${part.title.padEnd(44)} ${body.length} elements`);
}

const doc = new Document({
  creator: "Gridiron Engineering",
  title: "Gridiron — Complete Documentation",
  description: "Handover, architecture, security, audit and operations in one document",
  numbering: { config: NUMBERING },
  styles: {
    default: { document: { run: { font: "Calibri", size: 21, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 32, bold: true, color: NAVY },
        paragraph: { spacing: { before: 320, after: 150 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 25, bold: true, color: BLUE },
        paragraph: { spacing: { before: 240, after: 100 }, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 21, bold: true, color: "3A3A3A" },
        paragraph: { spacing: { before: 170, after: 65 }, keepNext: true } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, bottom: 1150, left: 1300, right: 1300 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Gridiron — Complete Documentation   |   13 August 2026   |   Page ", size: 16, color: GREY, font: "Calibri" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: "Calibri" }),
          ],
        })],
      }),
    },
    children,
  }],
});

const OUT = process.argv[2] || "Gridiron_Complete_Documentation.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT} — ${buf.length} bytes, ${children.length} elements`);
});
