/**
 * Client handover document.
 *
 * STRUCTURE IS FIXED BY THE CLIENT'S REQUEST, in this order:
 *
 *   1. Content of the project
 *   2. How it works
 *   3. How the database and backend work
 *   4. How many levels of security it has
 *   5. The checklist to take it live
 *
 * WHO IT IS FOR. A business owner and their engineer, reading together. The
 * previous version of this file was 106 pages and nobody would have read it;
 * the version before that answered questions in the order WE wanted to answer
 * them. This answers them in the order the client asked.
 *
 * RULES FOR EDITING. Prefer a table to a paragraph. Explain in plain English
 * first and name the technology second — "the database refuses to hand out
 * another player's data" before "row level security". Every claim here is
 * verifiable in the long reference document; nothing is asserted that was not
 * checked against the running system. Keep it under about twenty pages: past
 * that it stops being read, and an unread document has communicated nothing.
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

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 340, after: 170 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
  children: [new TextRun({ text, size: 30, bold: true, color: NAVY, font: "Calibri" })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 250, after: 110 },
  children: [new TextRun({ text, size: 24, bold: true, color: BLUE, font: "Calibri" })],
});

const bullet = (runs) => new Paragraph({
  numbering: { reference: "b", level: 0 },
  spacing: { after: 90, line: 274 },
  children: (Array.isArray(runs) ? runs : [{ t: runs }]).map((r) => new TextRun({
    text: r.t, bold: r.b, size: 21, color: r.c ?? "222222",
    font: r.mono ? "Consolas" : "Calibri",
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
        children: r.map((cRaw, i) => {
          const obj = cRaw && typeof cRaw === "object";
          return cell(obj ? cRaw.text : cRaw, {
            w: widths[i],
            fill: obj && cRaw.fill ? cRaw.fill : (ri % 2 ? "F4F6FA" : undefined),
            color: obj ? cRaw.color : undefined,
            bold: obj ? cRaw.bold : undefined,
          });
        }),
      })),
    ],
  });
}

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

const code = (lines) => (Array.isArray(lines) ? lines : [lines]).map((ln, i, a) => new Paragraph({
  spacing: { after: i === a.length - 1 ? 140 : 0, line: 240 },
  shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
  border: { left: { style: BorderStyle.SINGLE, size: 14, color: "C4CDD5", space: 8 } },
  children: [new TextRun({ text: ln.length ? ln : " ", font: "Consolas", size: 17, color: "24292E" })],
}));

const spacer = (h = 160) => new Paragraph({ spacing: { after: h }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const DONE = { text: "DONE", color: GREEN, bold: true, fill: "E8F3EC" };
const TODO = { text: "TO DO", color: RED, bold: true, fill: "FBECEC" };

const c = [];

// ── Cover ───────────────────────────────────────────────────────────────────
c.push(
  new Paragraph({ spacing: { before: 1600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron", bold: true, size: 68, color: NAVY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 90, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "NFL Sports Pool Platform", size: 32, color: BLUE, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 150, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Project Handover", size: 30, color: GREY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 40, after: 500 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "What was built, how it works, and what it takes to go live", size: 21, italics: true, color: GREY, font: "Calibri" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 160, after: 320 }, children: [new TextRun({ text: "", size: 2 })] }),
);
c.push(P("14 August 2026", { align: AlignmentType.CENTER, color: GREY }));
c.push(spacer(200));
c.push(table([700, 8300], null, [
  ["1", "Content of the project — what you are receiving"],
  ["2", "How it works — the player's journey, end to end"],
  ["3", "How the database and backend work"],
  ["4", "Levels of security — seven, and what each one stops"],
  ["5", "Go-live checklist — what remains, and who does it"],
]));
c.push(pageBreak());

// ══ 1. CONTENT OF THE PROJECT ═══════════════════════════════════════════════
c.push(H1("1.  Content of the project"));

c.push(P("Gridiron is a complete, working real-money contest platform. Players buy entries to NFL prediction pools; the system scores the results automatically, splits the prize pot to the exact cent, and pays the winners into a balance they can withdraw."));

c.push(H2("What is included"));
c.push(table([2700, 6300], ["Component", "What it covers"], [
  ["The application", "53 server endpoints, 25 screens, 63 interface components. Around 25,700 lines of code."],
  ["The database", "26 tables and 35 versioned migrations, so the database can be rebuilt from scratch in one command."],
  ["Payments", "Stripe for money coming in, PayPal for payouts going out. Both fully wired."],
  ["Regulatory controls", "Age verification, territory restrictions, self-exclusion, spending limits, identity checks, tax-reporting figures, and data-protection requests."],
  ["Automated testing", "50 unit tests, a payout-arithmetic proof across 243 scenarios, and 58 checks that run against the live site after every release."],
  ["Monitoring", "A health check, error alerting, and a nightly reconciliation that compares Stripe against our own ledger."],
  ["Documentation", "This document, plus a 108-page reference covering architecture, the security model, the full audit findings, and an incident runbook."],
]));

c.push(H2("Features the player sees"));
c.push(bullet([{ t: "Public and private pools. ", b: true }, { t: "Anyone can join a public pool; private pools are invitation only." }]));
c.push(bullet([{ t: "Up to three entries per pool, ", b: true }, { t: "each with its own set of predictions." }]));
c.push(bullet([{ t: "Live NFL scores ", b: true }, { t: "pulled automatically, so results settle without anyone intervening." }]));
c.push(bullet([{ t: "In-app balance and withdrawals ", b: true }, { t: "to a linked PayPal address." }]));
c.push(bullet([{ t: "Pool chat, ", b: true }, { t: "restricted to players who actually hold an entry." }]));
c.push(bullet([{ t: "Responsible-gambling controls ", b: true }, { t: "players can set themselves: spending limits and self-exclusion." }]));

c.push(H2("Features the operator sees"));
c.push(bullet([{ t: "An admin area ", b: true }, { t: "for approving payouts, managing users and setting the platform fee — every action recorded in an audit log." }]));
c.push(bullet([{ t: "Two-factor authentication required ", b: true }, { t: "before any administrator can move money." }]));
c.push(bullet([{ t: "Automatic settlement ", b: true }, { t: "every 30 minutes, so a pool that finishes at 4pm pays out in minutes rather than the next morning." }]));

c.push(spacer(140));
c.push(callout(
  "Current state",
  "Deployed and live. The software side is finished and independently audited across three cycles, with every finding closed. What remains before real money moves is listed in section 5: a PayPal account, one afternoon of testing, and a legal opinion on where you may operate.",
  "EAF2EA", GREEN
));

c.push(pageBreak());

// ══ 2. HOW IT WORKS ═════════════════════════════════════════════════════════
c.push(H1("2.  How it works"));
c.push(P("The whole product, from a player arriving to money reaching their PayPal account.", { italics: true }));
c.push(spacer(80));

c.push(table([500, 2500, 6000], ["#", "Step", "What happens"], [
  ["1", "Sign up", "Email and password. The player gives their date of birth and accepts the terms and contest rules. Under-18s are refused, and the check is repeated on the server so it cannot be bypassed in the browser."],
  ["2", "Choose a pool", "A pool covers 6–9 NFL games from one week and has a fixed entry fee."],
  ["3", "Pay the entry fee", "Through Stripe. The price is decided by our server, never sent from the player's device, so it cannot be altered."],
  ["4", "Receive an entry card", "Issued only after Stripe confirms the payment. Confirmation comes directly from Stripe to our server, so a closed browser tab or lost connection cannot cost a player their entry."],
  ["5", "Make predictions", "Pick each game's winner plus a total-score tiebreaker. Picks stay editable until that game kicks off, then lock permanently."],
  ["6", "Games are played", "Final scores are pulled automatically from the ESPN scoreboard."],
  ["7", "Settlement", "Once every game in the pool has finished, all entries are scored, winners determined, and their share credited to their balance."],
  ["8", "Withdrawal", "The player links a PayPal address and requests a payout. An administrator approves it and the funds are sent."],
]));

c.push(H2("How a winner is decided"));
c.push(P("An entry is eligible only if it has a prediction for every finished game. Entries are ranked by percentage of correct picks. Ties are broken by whoever came closest on the total-score prediction; an entry with no total-score prediction is treated as worst case, so it cannot win a tie by default. If a genuine tie remains, the pot is split."));
c.push(P("Cancelled or postponed games count as correct for everyone, so a disrupted fixture cannot arbitrarily knock a player out."));

c.push(spacer(140));
c.push(callout(
  "Money is split to the exact cent",
  "The pot is divided in whole cents, with any leftover penny distributed one at a time in a fixed order. Payouts therefore add up to exactly the prize pot — never a cent more or less — for every possible pot size and number of winners. This is not an assumption: it is proven automatically across 243 different combinations every time the code changes.",
  "EEF2F7", BLUE
));

c.push(pageBreak());

// ══ 3. DATABASE AND BACKEND ═════════════════════════════════════════════════
c.push(H1("3.  How the database and backend work"));

c.push(H2("The shape of it"));
c.push(P("There is no separate backend server to maintain. The website and its backend are one application, deployed together on Vercel, talking to a Postgres database hosted by Supabase."));
c.push(spacer(60));
c.push(table([2500, 6500], ["Piece", "What it does"], [
  ["The application", "Serves the pages and contains the backend logic. Runs on demand rather than on a server you rent by the month."],
  ["The database (Postgres)", "Stores everything and, importantly, enforces the rules itself rather than trusting the application to."],
  ["Stripe", "Takes entry payments. Confirms them directly to our server."],
  ["PayPal", "Sends withdrawals out."],
  ["ESPN feed", "Supplies fixtures and live scores."],
  ["Scheduled jobs", "Settle finished pools, reconcile payments nightly, and alert on errors."],
]));

c.push(H2("The one design decision that matters most"));
c.push(P("The database, not the application, is the security boundary."));
c.push(P("In most systems the application decides who may see what: it asks the database for data and then filters it. If the application has a bug, the data leaks. Here the database holds its own rules — it will refuse to return another player's entries or move money, even if the application asks it to."));
c.push(P("The practical consequence is that a programming mistake alone is not enough to leak data or move money. Both layers would have to fail together. During the audit this was tested by attacking the live database directly, as an anonymous user and as a signed-in one, attempting to read other players' data and write to the money tables. Every attempt was refused."));

c.push(H2("What is stored"));
c.push(table([2600, 6400], ["Data", "Notes"], [
  ["Players", "Profile, role and cash balance. A player can only read their own row, and can never change their own balance or role."],
  ["Pools, games and entries", "The contest, its fixtures, and each player's entry."],
  ["Predictions", "The strictest privacy rule in the product: visible only to the player who made them, until kickoff."],
  ["Payments in", "Every entry fee, tied to the Stripe payment that created it."],
  ["The ledger", "An append-only record of every balance movement. Nothing is ever edited or deleted — corrections are added as new entries, so the history is always complete."],
  ["Winners and payouts", "Settlement results and withdrawal requests."],
  ["Compliance record", "Age, territory, limits, self-exclusion and identity status, plus a log of every decision made about them."],
  ["Audit log", "Who did what, when, in the admin area — including the before and after values."],
]));

c.push(pageBreak());

c.push(H2("How money moves safely"));
c.push(P("Four rules govern every movement of money, and each is enforced by the database rather than by careful programming."));
c.push(spacer(60));
c.push(table([2400, 6600], ["Rule", "How it is guaranteed"], [
  ["Nobody is charged the wrong amount", "The price comes from the pool record on our server. The player's device never sends a price."],
  ["Nobody gets a free entry", "An entry can only be created by the confirmation Stripe sends directly to our server, and the payment record is tied to a unique Stripe reference."],
  ["Nobody is paid twice", "A database rule makes recording the same win twice impossible. Even if two requests arrive at the same instant, the second is rejected and the whole operation is undone."],
  ["Two people acting at once cannot cause a double payout", "Money moves through database routines that take a lock, so simultaneous requests queue rather than overlap. The balance is adjusted by an instruction to \"add this amount\", never by writing back a figure read a moment earlier."],
]));

c.push(H2("If something goes wrong"));
c.push(bullet([{ t: "Everything fails closed. ", b: true }, { t: "A misconfigured component refuses to act rather than guessing. An unset PayPal credential blocks a payout instead of sending it from a test account." }]));
c.push(bullet([{ t: "Errors are recorded, not swallowed. ", b: true }, { t: "Failures on any money path are written to an error table and included in an alert digest every two hours." }]));
c.push(bullet([{ t: "Payments are reconciled nightly. ", b: true }, { t: "A job compares Stripe's records against our own in both directions and flags any mismatch — so a payment that was taken but not recorded surfaces the next morning rather than when a player complains." }]));

c.push(pageBreak());

// ══ 4. SECURITY ═════════════════════════════════════════════════════════════
c.push(H1("4.  Levels of security"));
c.push(P("Seven, layered so that no single failure is enough. Each is independent of the others.", { italics: true }));
c.push(spacer(80));

c.push(table([500, 2600, 5900], ["#", "Layer", "What it stops"], [
  ["1", "The front door — signing in", "Anyone acting without proving who they are. Passwords must be strong, and are checked against known breached-password lists at signup."],
  ["2", "The guest list — permissions", "A signed-in player doing something they are not entitled to. Being logged in is not enough; every action checks whether this particular person may take it, and a player can only ever touch their own account, entries and money."],
  ["3", "The vault's own lock — database rules", "Data leaking through an application bug. Even if a mistake left a door open, the database itself refuses to hand out another player's information or move money. This is the layer most systems do not have."],
  ["4", "The cashier — money handling", "Wrong charges, free entries, and double payouts. The server decides all prices and amounts, payments are confirmed with Stripe directly, and duplicate payouts are structurally impossible."],
  ["5", "Fair play — game integrity", "Cheating. Predictions are private from other players and lock the moment a game starts, so nobody can peek at rivals' picks or bet on a result they already know."],
  ["6", "Robots and secrets — automated jobs", "An outsider triggering settlement or forging a payment message. Scheduled jobs require a shared secret, and Stripe's messages are verified by cryptographic signature before being trusted."],
  ["7", "The bouncer — checking what comes in", "Malicious or malformed input. Everything sent to the server is inspected and validated before it is used."],
]));

c.push(spacer(160));
c.push(H2("How this was verified"));
c.push(P("Three independent audit cycles ran against this system. Every finding was closed. The testing was adversarial rather than a paper review — the system was attacked directly, and these attempts were made and refused:"));
c.push(bullet("Writing to the money tables as an anonymous user, and as a signed-in one."));
c.push(bullet("Reading another player's predictions, balance and personal details."));
c.push(bullet("Shortening a self-exclusion that had already been set."));
c.push(bullet("Crediting the same win twice."));
c.push(bullet("Promoting an ordinary account to administrator."));
c.push(bullet("Triggering settlement without the shared secret, and forging a payment confirmation."));

c.push(spacer(140));
c.push(callout(
  "What security testing does not cover",
  "This was an audit and adversarial testing, not a formal penetration test by a third party. It covered the code, the live database, the deployed site and every automated check — but a professional penetration test with signed-in sessions is a different exercise, and worth commissioning before the platform holds significant balances.",
  "FBF3E6", AMBER
));

c.push(pageBreak());

// ══ 5. GO-LIVE CHECKLIST ════════════════════════════════════════════════════
c.push(H1("5.  Go-live checklist"));
c.push(P("Everything on the software side is complete. These are the remaining steps, in the order they should be done.", { italics: true }));
c.push(spacer(80));

c.push(H2("Already done — no action needed"));
c.push(table([3400, 1200, 4400], ["Item", "Status", "Verified by"], [
  ["Database credentials", DONE, "Live health check reports the database reachable."],
  ["Stripe payment keys", DONE, "Live and confirmed working."],
  ["Stripe payment confirmations", DONE, "Unsigned requests are correctly rejected — tested from outside."],
  ["Scheduled-job secret", DONE, "Both scheduled jobs run and report success."],
  ["Rate limiting", DONE, "Confirmed distributed by measuring the limit from outside."],
  ["Settlement schedule", DONE, "Runs every 30 minutes; verified running, not merely enabled."],
  ["Error alerting", DONE, "Verified running."],
]));

c.push(spacer(160));
c.push(H2("Remaining — in order"));
c.push(table([500, 2900, 1100, 4500], ["#", "Task", "Effort", "What it means if skipped"], [
  ["1", "Start the legal opinion on jurisdictions", "Weeks", "Do this first because it takes longest. Paid contests with cash prizes are regulated differently in every US state and most countries — some require a licence, some prohibit the model. Operating without an answer risks enforcement action and frozen funds. The software already enforces whatever rules you give it; applying the answer is a database change, not a rebuild."],
  ["2", "Confirm Stripe and PayPal permit this business", "Days", "Both restrict contest and gambling-related businesses and require prior approval. Operating outside the agreed category risks the account being closed while it holds player money."],
  ["3", "Add PayPal credentials", "10 min", "Withdrawals cannot send. The system refuses to pay rather than paying from a test account, so no money goes astray — but players cannot cash out."],
  ["4", "Run the payment path once in test mode", "Half a day", "Buy an entry with a test card, watch it settle and pay out, and deliberately repeat the payment confirmation to prove it cannot double-charge. Skipping this means a paying player finds any break, not you."],
  ["5", "Turn on point-in-time database backups", "15 min", "A restore could lose up to 24 hours of money movements — balances you cannot account for."],
  ["6", "Have a lawyer read the terms and contest rules", "Days", "The published rules match the software exactly, which makes this review cheap. Accurate is not the same as compliant."],
  ["7", "One accessibility review with a screen reader", "1 hour", "Automated checks pass, but they cannot judge whether the experience makes sense to a blind user."],
]));

c.push(spacer(160));
c.push(H2("Checking readiness yourself"));
c.push(P("The platform reports its own status. One command, no engineer required:"));
c.push(...code('curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://sports-pool.vercel.app/api/health'));
c.push(P("It lists every component and names anything missing. Today it reports one thing outstanding: payouts are disabled pending PayPal. When it reports \"ok\", the platform is fully provisioned."));

c.push(spacer(180));
c.push(callout(
  "In one sentence",
  "The software is finished, audited and running; what remains is a PayPal account, one afternoon of testing, and a lawyer's answer on where you are allowed to operate — and that last one is the only item measured in weeks, so it is the one to start today.",
  "EAF2EA", GREEN
));

c.push(spacer(200));
c.push(P("Full detail — architecture, the complete audit findings, endpoint-by-endpoint security, and the incident runbook — is in the accompanying 108-page reference document.", { italics: true, color: GREY, size: 19 }));

// ── Assemble ────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Gridiron Engineering",
  title: "Gridiron — Project Handover",
  description: "Contents, how it works, database and backend, security levels, and the go-live checklist",
  numbering: {
    config: [{
      reference: "b",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 440, hanging: 250 } } },
      }],
    }],
  },
  styles: { default: { document: { run: { font: "Calibri", size: 21, color: "222222" } } } },
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
          new TextRun({ text: "Gridiron — Project Handover   |   14 August 2026   |   Page ", size: 16, color: GREY, font: "Calibri" }),
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
