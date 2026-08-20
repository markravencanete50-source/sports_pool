/**
 * Transfer guide — the document the developer sends TO the client.
 *
 * PURPOSE. Everything else we produce explains the system. This one asks for
 * something: the accounts and decisions needed to move the project into the
 * client's own name. It is written to be forwarded as-is, so it addresses the
 * client directly as "you" and never assumes technical knowledge.
 *
 * THE SECTION THAT MATTERS is "What we need from you". It is a fill-in table
 * rather than prose, because a request buried in paragraphs gets read and not
 * acted on. Each row says what it is, why it is needed, and how to send it —
 * including the rows where the answer is "do not send it to us at all".
 *
 * SECURITY POSTURE, DELIBERATELY. The guide never asks the client to email a
 * password, an API key or a card number. Where access is needed, it asks them
 * to invite us to their account instead, which they can revoke afterwards and
 * which leaves an audit trail on their side. Where a secret must exist, we tell
 * them where to paste it themselves. A handover document that trains a client
 * to email credentials has taught them a habit that will outlive the project.
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
    text: r.t, bold: r.b, size: 21, color: r.c ?? "222222", font: "Calibri",
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
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
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
        children: r.map((raw, i) => {
          const obj = raw && typeof raw === "object";
          return cell(obj ? raw.text : raw, {
            w: widths[i],
            fill: obj && raw.fill ? raw.fill : (ri % 2 ? "F4F6FA" : undefined),
            color: obj ? raw.color : undefined,
            bold: obj ? raw.bold : undefined,
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

const spacer = (h = 160) => new Paragraph({ spacing: { after: h }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
/** A blank the client fills in. */
const BLANK = { text: "", fill: "FFFDF5" };

const c = [];

// ── Cover ───────────────────────────────────────────────────────────────────
c.push(
  new Paragraph({ spacing: { before: 1700, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron", bold: true, size: 66, color: NAVY, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 90, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Transferring the project to you", size: 32, color: BLUE, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 150, after: 520 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "What we need from you, what we will do, and what you will own at the end", size: 21, italics: true, color: GREY, font: "Calibri" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 160, after: 340 }, children: [new TextRun({ text: "", size: 2 })] }),
);
c.push(P("The technical transfer is largely complete. This document records what is done, what remains, and what only you can provide. The one thing needed from you is in the box below.", { align: AlignmentType.CENTER, italics: true, color: GREY }));
c.push(pageBreak());

// ══ 0. STATUS ═══════════════════════════════════════════════════════════════
c.push(H1("Where this stands right now"));
c.push(P("The heavy lifting is done. Your project now runs on your own GitHub and Supabase accounts, and the parts that are hardest to get right — the database and its security controls — have been rebuilt from scratch on your infrastructure and independently verified."));
c.push(spacer(60));
c.push(H2("Done and verified"));
c.push(table([4400, 4600], ["What", "Evidence"], [
  ["Source code on your GitHub", "Full history, every commit intact"],
  ["Database rebuilt on your Supabase", "All 35 build steps applied; 7 of 7 money-guard checks pass"],
  ["Reference data loaded", "All 32 NFL teams and your platform settings"],
  ["Website live and verified", "Serving from your own account, security verified by 14 automated checks"],
  ["Abuse protection active", "Distributed rate limiting on your own Upstash database"],
]));
c.push(spacer(140));
c.push(H2("Waiting only on you"));
c.push(P("None of these is development work. Each is an account or an approval that only you can provide, because they are your business's financial and legal relationships — not something a developer can or should hold on your behalf."));
c.push(table([3400, 5600], ["Item", "Why it is yours, and why it matters"], [
  ["Stripe — keys and account approval", "Your Stripe account takes card payments. Two parts: the live keys (a copy-paste we will walk you through), and — more important — confirmation that Stripe has approved your account for contest-style businesses. Stripe can suspend an unapproved account with funds held, so start this conversation now; it takes days, not minutes."],
  ["PayPal — payout credentials", "Your PayPal Business account sends winnings out. Until its credentials are set, withdrawals are safely blocked rather than sent wrongly."],
  ["Point-in-time backups", "One switch in Supabase, on your paid plan. It lets the database be rewound to any moment — the difference between a bad day and a lost ledger once real money is in play. We need administrator access on your Supabase organisation to enable it, or you can flip it yourself."],
  ["Your administrator account", "You create it, not us — it approves payouts, so it should be yours from the first day. We will show you the one-step process; it takes a minute."],
]));
c.push(spacer(120));
c.push(callout(
  "The plain-English bottom line",
  "Everything mechanical is finished and checked. What is left is you connecting your own money accounts and making one backup decision. Once Stripe and PayPal are wired, the platform can take real entries and pay real winnings — subject to the legal sign-off in section 4.",
  "EAF2EA", GREEN
));
c.push(pageBreak());

// ══ 1. WHAT IS HAPPENING ════════════════════════════════════════════════════
c.push(H1("1.  What is happening, in plain English"));

c.push(P("Your platform runs on three things, and all three need to be in your name for the handover to be complete."));
c.push(spacer(60));
c.push(table([2200, 6800], ["Service", "What it does for you"], [
  ["GitHub", "Stores the source code and its full history."],
  ["Supabase", "The database. Holds players, entries, balances and every transaction."],
  ["Your server (VPS)", "The hosting. Runs the website and serves it to your players."],
]));

c.push(spacer(140));
c.push(P("Once transferred, you own all three outright. You can change developers, take the work in-house, or move hosting later without needing anything from us. Nothing is locked to us and there is no ongoing dependency on our accounts."));

c.push(H2("Why we rebuild the database rather than hand it over"));
c.push(P("The database is the one piece we recreate instead of transferring, for two reasons."));
c.push(bullet([{ t: "It is currently attached to our hosting account, ", b: true }, { t: "not held separately. Detaching it is more work and more risk than simply building you a fresh one." }]));
c.push(bullet([{ t: "There is nothing in it to lose. ", b: true }, { t: "The platform has not gone live, so there are no players, no entries and no transactions — only settings and reference data, which we recreate automatically." }]));
c.push(P("The result is identical: the same structure, the same rules, the same settings. Built in one command from the same instructions the current database was built from, and verified automatically every time the code changes."));

c.push(spacer(120));
c.push(callout(
  "A recommendation worth taking",
  "Create your database account directly with Supabase rather than through your hosting provider. It costs the same, but it keeps your database independent of your hosting — so if you ever change hosting, your data does not have to move with it. The current setup ties the two together, which is precisely what has made this handover more involved than it needed to be.",
  "EEF2F7", BLUE
));

c.push(pageBreak());

// ══ 2. WHAT WE NEED FROM YOU ════════════════════════════════════════════════
c.push(H1("2.  What we need from you"));
c.push(P("This is the only section that needs a reply. Please fill in the right-hand column and send it back.", { italics: true }));
c.push(spacer(100));

c.push(H2("A.  Accounts to create"));
c.push(P("Please create these free accounts, then invite us to each one. Instructions for inviting are in section 3."));
c.push(spacer(60));
c.push(table([2200, 3900, 2900], ["Account", "What we need", "Your answer"], [
  ["GitHub", "Your GitHub username, or your company organisation name.", BLANK],
  ["Supabase", "The email address you signed up with, and your organisation name.", BLANK],
  ["Your server (VPS)", "Who is providing and administering it, and the address we should point the site at. We do not need login access unless you want us to set it up.", BLANK],
]));

c.push(spacer(180));
c.push(H2("B.  Payment accounts"));
c.push(P("These stay entirely yours — we never need the passwords or keys, only to know they exist and who is setting them up."));
c.push(spacer(60));
c.push(table([2200, 3900, 2900], ["Account", "What we need", "Your answer"], [
  ["Stripe", "Confirmation that you have a Stripe account, and whether it is approved for contest businesses. Do NOT send us the keys.", BLANK],
  ["PayPal", "Confirmation that you have a PayPal Business account with Payouts enabled. Do NOT send us the credentials.", BLANK],
]));

c.push(spacer(180));
c.push(H2("C.  Decisions we need"));
c.push(table([2600, 3500, 2900], ["Decision", "Why it is needed", "Your answer"], [
  ["Your web address", "The domain players will visit. If you do not have one yet, we can keep the temporary address for now.", BLANK],
  ["First administrator", "The email address of the person who will approve payouts. They must be able to receive email at it.", BLANK],
  ["Platform fee", "The percentage kept from each prize pot. Currently set to 10%.", BLANK],
  ["Where you may operate", "The list of countries and US states, from your lawyer. We can transfer without this, but you cannot take real money until you have it.", BLANK],
  ["Support contact", "The email address players use to raise a problem.", BLANK],
]));

c.push(pageBreak());

// ══ 3. HOW TO GIVE US ACCESS SAFELY ═════════════════════════════════════════
c.push(H1("3.  How to give us access safely"));
c.push(P("Please invite us to your accounts rather than sending us passwords. Invitations can be withdrawn afterwards in one click and leave a record on your side.", { italics: true }));
c.push(spacer(80));

c.push(table([2000, 7000], ["Service", "How to invite us"], [
  ["GitHub", "You do not need to invite us. When we start the transfer, GitHub will email you a request to accept — simply accept it, and the code becomes yours."],
  ["Supabase", "Open your organisation, go to Team or Members, choose Invite, enter our email address and select Owner or Administrator. You can remove us once the work is finished."],
  ["Your server (VPS)", "However your server administrator prefers. If they are running the setup themselves, we do not need access at all — we will send them the instructions and answer questions."],
]));

c.push(spacer(160));
c.push(callout(
  "Please do not send us these, by email or message",
  "Passwords. Payment keys. Card details. Recovery codes. We never need them — where a secret is required we will tell you exactly where to paste it yourself, and we will confirm it is working without ever seeing the value. If anyone asks you to email a payment key, for this project or any other, treat that as a warning sign.",
  "FBECEC", RED
));

c.push(spacer(160));
c.push(H2("What it will cost you"));
c.push(table([2200, 2000, 4800], ["Service", "Cost", "Notes"], [
  ["GitHub", "Free", "Private repositories are included at no cost."],
  ["Supabase", "Free to start", "A paid plan is needed for point-in-time backups, which we strongly recommend before you hold real player balances. Around 25 US dollars a month."],
  ["Your server (VPS)", "Typically 5 to 20 US dollars a month", "Whatever your provider charges. The site and its two scheduled jobs run there."],
  ["Stripe / PayPal", "Per transaction", "No monthly fee; they take a percentage of each payment."],
]));

c.push(pageBreak());

// ══ 4. WHAT WE WILL DO ══════════════════════════════════════════════════════
c.push(H1("4.  What we will do"));
c.push(P("Once you have sent section 2, the work is roughly half a day. You do not need to be present, but you will need to accept two invitations.", { italics: true }));
c.push(spacer(80));

c.push(table([500, 3100, 5400], ["#", "Step", "What it involves"], [
  ["1", "Move the code to you", "We start a transfer on GitHub; you accept the emailed request. The full history comes with it — including the notes explaining why each security control exists."],
  ["2", "Build your database", "We create the database in your account and build the structure from scratch — 35 versioned steps, applied in one command, then the standard settings loaded."],
  ["3", "Set up hosting", "We connect your hosting account to your code and configure it. You will paste in your own payment keys; we never see them."],
  ["4", "Connect payments", "We point Stripe's confirmation messages at your new address, so a completed payment reliably issues an entry."],
  ["5", "Turn on the automatic jobs", "Settling finished pools, checking payments nightly, and error alerts."],
  ["6", "Create your administrator", "Your nominated person signs up, we grant them administrator rights, and they set up two-factor authentication — required before anyone can approve a payout."],
  ["7", "Verify everything", "We run the full automated check against your live site: 58 tests covering security, payments, and the pages your players see. We send you the results."],
  ["8", "Hand over and step back", "We confirm the platform reports itself healthy, then you remove our access from all three accounts."],
]));

c.push(spacer(180));
c.push(H2("How you will know it worked"));
c.push(P("The platform reports its own health. We will send you a single link that shows every part of the system and anything still missing. When it says everything is fine, the transfer is complete and correct — you do not need to take our word for it."));

c.push(spacer(160));
c.push(callout(
  "One thing to start today, separately",
  "Ask your lawyer which countries and US states you may operate in. This has nothing to do with the transfer and can run alongside it — but it is the one item measured in weeks rather than hours, and you cannot accept a real payment until you have the answer. The software already enforces whatever rules you give it; applying their answer is a small settings change, not new development.",
  "FBF3E6", AMBER
));

c.push(spacer(200));
c.push(P("If anything here is unclear, ask before filling it in — a wrong answer in section 2 costs more to unpick than a question costs to answer.", { italics: true, color: GREY }));

// ── Assemble ────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Gridiron Engineering",
  title: "Gridiron — Transferring the project to you",
  description: "What we need from you to move the project into your accounts",
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
          new TextRun({ text: "Gridiron — Project transfer   |   Page ", size: 16, color: GREY, font: "Calibri" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: "Calibri" }),
        ],
      })] }),
    },
    children: c,
  }],
});

const OUT = process.argv[2] || "Gridiron_Transfer_Guide.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT} — ${buf.length} bytes`);
});
