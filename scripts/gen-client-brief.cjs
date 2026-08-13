/**
 * Client brief — the short one.
 *
 * WHY THIS EXISTS. The combined documentation is 106 pages. That is the right
 * length for a reference someone consults, and the wrong length for a document
 * someone reads. Nobody receiving a handover reads 106 pages; they skim the
 * first two, look for what they have to do, and file the rest. A document that
 * is not read has not communicated anything, however thorough it is.
 *
 * So this is deliberately a different artefact rather than a trimmed version of
 * the same one. It answers four questions in the order a client actually asks
 * them:
 *
 *   1. Is it ready?
 *   2. What do I have to do?
 *   3. What did you find?
 *   4. What could still go wrong?
 *
 * Everything else — the architecture, the endpoint inventory, the full findings
 * register, the incident runbook — stays in the long document, referenced once
 * at the end. This does not repeat it, because a summary that includes
 * everything is just the original document with smaller margins.
 *
 * RULES FOR EDITING THIS. Keep it under roughly ten pages. Prefer a table to a
 * paragraph. State the verdict before the evidence. If a section grows past a
 * page, it belongs in the long document instead.
 */

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, LevelFormat, Footer, PageNumber,
} = require("docx");
const fs = require("fs");

const NAVY = "1F3864";
const BLUE = "2E4A7A";
const GREEN = "1E7A3E";
const RED = "B22222";
const AMBER = "8A5A00";
const GREY = "595959";

const CONTENT = 9000;

const P = (text, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 140, line: 280 },
  alignment: o.align,
  children: [new TextRun({
    text, size: o.size ?? 21, color: o.color ?? "222222",
    bold: o.bold, italics: o.italics, font: "Calibri",
  })],
});

const Rich = (runs, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 140, line: 280 },
  children: runs.map((r) => new TextRun({
    text: r.t, bold: r.b, italics: r.i, size: r.size ?? 21,
    color: r.c ?? "222222", font: r.mono ? "Consolas" : "Calibri",
  })),
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 340, after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
  children: [new TextRun({ text, size: 30, bold: true, color: NAVY, font: "Calibri" })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 100 },
  children: [new TextRun({ text, size: 24, bold: true, color: BLUE, font: "Calibri" })],
});

const bullet = (runs) => new Paragraph({
  numbering: { reference: "b", level: 0 },
  spacing: { after: 90, line: 274 },
  children: (Array.isArray(runs) ? runs : [{ t: runs }]).map((r) => new TextRun({
    text: r.t, bold: r.b, size: 21, color: r.c ?? "222222", font: r.mono ? "Consolas" : "Calibri",
  })),
});

const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};

function cell(content, { w, fill, header, color, bold, size } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    borders: BORDERS,
    children: [new Paragraph({
      spacing: { after: 0, line: 256 },
      children: [new TextRun({
        text: content, size: size ?? 19, bold: header || bold,
        color: header ? "FFFFFF" : color, font: "Calibri",
      })],
    })],
  });
}

function table(widths, headers, rows) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      ...(headers ? [new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { w: widths[i], fill: NAVY, header: true })),
      })] : []),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => {
          const obj = c && typeof c === "object";
          return cell(obj ? c.text : c, {
            w: widths[i],
            fill: obj && c.fill ? c.fill : (ri % 2 ? "F4F6FA" : undefined),
            color: obj ? c.color : undefined,
            bold: obj ? c.bold : undefined,
          });
        }),
      })),
    ],
  });
}

/** Coloured callout. Used sparingly — three in the whole document. */
function callout(title, body, fill = "EAF2EA", bar = GREEN) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 18, color: bar },
      },
      children: [
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: title, bold: true, size: 21, color: NAVY, font: "Calibri" })] }),
        new Paragraph({ spacing: { after: 0, line: 276 }, children: [new TextRun({ text: body, size: 20, font: "Calibri" })] }),
      ],
    })] })],
  });
}

const spacer = (h = 160) => new Paragraph({ spacing: { after: h }, children: [] });
const OK = { text: "DONE", color: GREEN, bold: true, fill: "E8F3EC" };
const TODO = { text: "TO DO", color: RED, bold: true, fill: "FBECEC" };

const c = [];

// ── Cover ───────────────────────────────────────────────────────────────────
c.push(
  new Paragraph({ spacing: { before: 1600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron", bold: true, size: 68, color: NAVY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 90, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "NFL Sports Pool Platform", size: 32, color: BLUE, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 150, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Handover Brief", size: 30, color: GREY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 40, after: 500 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "The short version — what is done, what is left, and what it costs to ignore", size: 21, italics: true, color: GREY, font: "Calibri" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 160, after: 340 }, children: [new TextRun({ text: "", size: 2 })] }),
);
c.push(P("14 August 2026", { align: AlignmentType.CENTER, color: GREY }));
c.push(P("A ten-page summary. Full detail — architecture, security model, incident runbook and the complete findings register — is in the accompanying 106-page reference.", { align: AlignmentType.CENTER, italics: true, color: GREY, size: 19 }));
c.push(new Paragraph({ children: [new PageBreak()] }));

// ── 1. The short version ────────────────────────────────────────────────────
c.push(H1("1.  The short version"));

c.push(P("Gridiron is finished software. It is deployed, it works, and it has been tested against the live system rather than only in theory."));

c.push(P("Three things stand between it and taking real money. None of them is code:"));
c.push(spacer(60));
c.push(table([600, 3400, 5000], null, [
  [{ text: "1", bold: true }, { text: "PayPal credentials", bold: true }, "About ten minutes. Withdrawals cannot send until these are set. Everything else about payments already works."],
  [{ text: "2", bold: true }, { text: "One test run of the payment path", bold: true }, "Half a day. Buy a card with a test card, watch it settle and pay out. Proves the chain end to end with a real payment processor."],
  [{ text: "3", bold: true }, { text: "A legal opinion on where you may operate", bold: true }, "Weeks, so start now. This is the long pole and the only genuine blocker."],
]));
c.push(spacer(140));

c.push(callout(
  "The one thing to act on this week",
  "Get the legal opinion moving. Paid contests with cash prizes are regulated differently in every US state and most other countries — some require a licence, some prohibit the model outright. The software already enforces whatever rules you give it, and applying counsel's answer is a database change rather than a rebuild. But you cannot take a deposit until you know the answer, and it is the only item on this list measured in weeks.",
  "FBF3E6", AMBER
));

c.push(H2("What you are getting"));
c.push(table([3000, 6000], null, [
  ["What it does", "Players buy entries to NFL prediction pools. The system scores results automatically, splits the prize pot to the exact cent, and pays winners into a withdrawable balance."],
  ["Built with", "Next.js, TypeScript, Postgres, Stripe for payments in, PayPal for payouts out, hosted on Vercel."],
  ["Size", "53 API endpoints, 35 database migrations, 26 tables, around 25,700 lines of code."],
  ["Live now", "Deployed and serving. 58 automated checks run against the real site after every release."],
]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ── 2. Is it ready ──────────────────────────────────────────────────────────
c.push(H1("2.  Is it ready?"));
c.push(P("Yes, on the software side. This is the honest status of every part of the system.", { italics: true }));
c.push(spacer(80));

c.push(H2("Working and verified"));
c.push(table([3600, 1300, 4100], ["Area", "Status", "How we know"], [
  ["Taking payments", OK, "Stripe live and verified. The webhook that issues a card after payment is confirmed working."],
  ["Paying winners out", { text: "PART", color: AMBER, bold: true, fill: "FBF3E6" }, "The maths and the safeguards are proven. Only the PayPal account credentials are missing."],
  ["Settlement", OK, "Runs every 30 minutes. Payout arithmetic proven correct across 243 scenarios."],
  ["Security", OK, "Independent audit; every finding closed. Attacks were attempted against the live database and refused."],
  ["Regulatory controls", OK, "Age checks, territory restrictions, self-exclusion, spending limits, identity checks — all enforced."],
  ["Monitoring", OK, "Health check, error alerting, and automatic verification of every release."],
  ["Documentation", OK, "Architecture, security model, incident procedures and a handover checklist."],
]));

c.push(spacer(160));
c.push(H2("What is deliberately not finished"));
c.push(P("Stated plainly rather than buried, because you should know what you are accepting:"));
c.push(bullet([{ t: "The payment path has never been run end to end with a real processor. ", b: true }, { t: "Every part is individually tested and the logic is proven, but the full chain — buy, settle, pay out — has not been executed once against Stripe's test system. This is item 2 on the list above." }]));
c.push(bullet([{ t: "No lawyer has reviewed the terms or confirmed which territories you may operate in. ", b: true }, { t: "The software enforces a deliberately conservative placeholder until you supply the real answer." }]));
c.push(bullet([{ t: "Stripe and PayPal have not confirmed in writing that they permit this business. ", b: true }, { t: "Both restrict contest and gambling-adjacent businesses. Operating outside the agreed category risks the account being closed while it holds player money." }]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ── 3. What you need to do ──────────────────────────────────────────────────
c.push(H1("3.  What you need to do"));
c.push(P("In order. The first three are technical and quick; the last three are conversations that take time to start.", { italics: true }));
c.push(spacer(80));

c.push(table([2900, 1100, 5000], ["Task", "Effort", "What happens if you skip it"], [
  ["Add PayPal credentials", "10 min", "Withdrawals silently do not send. The system refuses to pay rather than paying from a test account, so no money is lost — but players cannot cash out."],
  ["Run the payment path in test mode", "Half a day", "You find out whether buying, settling and paying out works from a real player losing real money, rather than from a test."],
  ["Turn on point-in-time database backups", "15 min", "A restore loses up to 24 hours of transactions. On a system holding player balances, that is money you cannot account for."],
  ["Get a legal opinion on jurisdictions", "Weeks", "Operating in a prohibited or licensed territory risks enforcement action and frozen funds. This is the largest single risk the project carries."],
  ["Get written approval from Stripe and PayPal", "Days", "Your payment accounts can be closed without notice while holding player balances."],
  ["Have a lawyer read the terms and contest rules", "Days", "The rules are accurate and match the software exactly, which makes this review cheap. Accurate is not the same as compliant."],
]));

c.push(spacer(180));
c.push(H2("Checking it yourself"));
c.push(P("The system reports its own readiness. One command, no engineer required:"));
c.push(new Paragraph({
  spacing: { before: 60, after: 60, line: 240 },
  shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
  border: { left: { style: BorderStyle.SINGLE, size: 14, color: "C4CDD5", space: 8 } },
  children: [new TextRun({ text: 'curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://sports-pool.vercel.app/api/health', font: "Consolas", size: 17, color: "24292E" })],
}));
c.push(P("It lists every component and what is missing. Right now it reports one thing: payouts are disabled pending PayPal. When it says \"ok\", the platform is fully provisioned."));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ── 4. What we found ────────────────────────────────────────────────────────
c.push(H1("4.  What the audit found"));
c.push(P("Three audit cycles ran against this system. Every finding is closed. These are the five worth knowing about — the full register is in the long document.", { italics: true }));
c.push(spacer(80));

c.push(table([3200, 5800], ["Found", "Why it mattered"], [
  ["Nothing had been deployed for eight days", "Six weeks of work — including every regulatory control — had never reached the live site. A scheduling setting made the hosting platform silently refuse each release while every status light stayed green. Fixed, and a check now blocks the setting that caused it."],
  ["A missing password left payments broken", "A single unset configuration value meant a player could be charged and receive nothing. It had been that way for eight days and nothing reported it. Fixed, and a health check now catches this class of problem within a minute."],
  ["Players could have been paid twice", "A flaw in the payout path could have credited the same win more than once. Closed, and the database now makes it structurally impossible rather than merely unlikely."],
  ["A crafted pool could have created money", "The platform fee was editable in a way that could have paid out more than a pool collected. Locked down at the database level."],
  ["Every signup field was invisible to screen readers", "The labels looked correct but were not connected to their boxes, so blind users heard nothing — including on the password and date of birth fields. Fixed and now automatically tested."],
]));

c.push(spacer(160));
c.push(callout(
  "How to read this section",
  "A report listing only successes is not a report. These were found because the system was attacked, queried and driven directly rather than reviewed on paper — including attempts to shorten a self-exclusion, pay a winner twice and write to the money tables as an anonymous user, all of which the database refused. The long document also records three findings that turned out to be mistakes in our own tests, and one checklist item that closed because the code was already correct.",
  "EEF2F7", BLUE
));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ── 5. Risks ────────────────────────────────────────────────────────────────
c.push(H1("5.  Risks worth knowing"));
c.push(P("Ranked by what it costs if it happens.", { italics: true }));
c.push(spacer(80));

c.push(table([2600, 1200, 5200], ["Risk", "Severity", "What it means"], [
  ["Operating without a legal opinion", { text: "HIGH", color: RED, bold: true, fill: "FBECEC" }, "Enforcement action and frozen funds in a prohibited or licensed territory. The largest risk the project carries, and the only one measured in weeks."],
  ["Payment path never run end to end", { text: "MEDIUM", color: AMBER, bold: true, fill: "FBF3E6" }, "A break anywhere in buy → settle → pay out would be found by a paying player rather than by you. Half a day of testing removes it."],
  ["Processor approval unconfirmed", { text: "MEDIUM", color: AMBER, bold: true, fill: "FBF3E6" }, "Stripe or PayPal closing the account while it holds player balances."],
  ["No point-in-time backups yet", { text: "MEDIUM", color: AMBER, bold: true, fill: "FBF3E6" }, "Up to 24 hours of money movements unrecoverable after a restore."],
]));

c.push(spacer(180));
c.push(H2("What protects the money"));
c.push(P("So the risks above are read in proportion:"));
c.push(bullet([{ t: "The database, not the app, is the security boundary. " }, { t: "A bug in the application alone cannot move money or leak data — the rules are enforced one layer deeper, where application code cannot bypass them." }]));
c.push(bullet([{ t: "Payouts cannot double. " }, { t: "A database constraint makes crediting the same win twice impossible, independent of any code path." }]));
c.push(bullet([{ t: "Nothing pays out by accident. " }, { t: "Every money-moving component refuses to run when misconfigured rather than guessing — an unset value blocks a payout instead of sending it to the wrong place." }]));
c.push(bullet([{ t: "Self-exclusion cannot be undone. " }, { t: "A player who excludes themselves cannot be un-excluded early by anyone, including support. This was tested by attempting it directly against the live database." }]));

c.push(new Paragraph({ children: [new PageBreak()] }));

// ── 6. Where the detail is ──────────────────────────────────────────────────
c.push(H1("6.  Where the detail lives"));
c.push(P("This brief is deliberately short. Everything below it exists in full in the accompanying reference document.", { italics: true }));
c.push(spacer(80));

c.push(table([2200, 6800], ["Part", "Read it when"], [
  ["I — Project Handover", "Your engineer is taking ownership and needs the architecture, data model and setup checklist."],
  ["II — Explained Simply", "A non-technical colleague needs to understand what the system does. No jargon."],
  ["III — Architecture & Security", "Your engineer or a security reviewer wants the threat model and every endpoint's protections."],
  ["IV — Security Audit Report", "You want the security findings in full, including the attacks the system withstood."],
  ["V — Full-Stack Audit", "You want the complete findings register and the detailed gap checklist."],
  ["VI — Operations Runbook", "Something has gone wrong. Incident procedures, backups, disputes, and how to add or remove an administrator."],
]));

c.push(spacer(200));
c.push(callout(
  "In one sentence",
  "The software is done and verified; what remains is a payment account, one afternoon of testing, and a lawyer's answer on where you are allowed to operate.",
  "EAF2EA", GREEN
));

// ── Assemble ────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Gridiron Engineering",
  title: "Gridiron — Handover Brief",
  description: "Ten-page client summary: status, remaining work, findings and risks",
  numbering: {
    config: [{
      reference: "b",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 440, hanging: 250 } } },
      }],
    }],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 21, color: "222222" } } },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1300, bottom: 1250, left: 1400, right: 1400 },
      },
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Gridiron — Handover Brief   |   14 August 2026   |   Page ", size: 16, color: GREY, font: "Calibri" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: "Calibri" }),
        ],
      })] }),
    },
    children: c,
  }],
});

const OUT = process.argv[2] || "Gridiron_Handover_Brief.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT} — ${buf.length} bytes`);
});
