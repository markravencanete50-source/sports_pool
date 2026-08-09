const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, TableOfContents, LevelFormat,
} = require("docx");
const fs = require("fs");

const NAVY = "1F3864";
const BLUE = "2E4A7A";
const GREEN = "1E7A3E";
const GREY = "595959";

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });

function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 130, line: 288 },
    alignment: opts.align,
    children: [new TextRun({ text, size: 22, color: opts.color, bold: opts.bold, italics: opts.italics })],
  });
}
function runs(children, opts = {}) {
  return new Paragraph({ spacing: { after: opts.after ?? 130, line: 288 }, alignment: opts.align, children });
}
function T(text, o = {}) {
  return new TextRun({ text, size: o.size ?? 22, bold: o.bold, italics: o.italics, color: o.color });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "dots", level },
    spacing: { after: 90, line: 288 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22 })],
  });
}
function step(n, title, body) {
  return new Paragraph({
    spacing: { after: 110, line: 288 },
    numbering: { reference: "steps", level: 0 },
    children: [new TextRun({ text: title + " — ", bold: true, size: 22, color: BLUE }), new TextRun({ text: body, size: 22 })],
  });
}

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};
function cell(text, { width, fill, header, bold } = {}) {
  const kids = (Array.isArray(text) ? text : [text]).map((c) =>
    typeof c === "string"
      ? new Paragraph({ spacing: { after: 0, line: 276 }, children: [new TextRun({ text: c, size: 20, bold: header || bold, color: header ? "FFFFFF" : undefined })] })
      : c
  );
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    borders: cellBorders,
    children: kids,
  });
}
function table(colWidths, headerCells, rows) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ tableHeader: true, children: headerCells.map((h, i) => cell(h, { width: colWidths[i], fill: NAVY, header: true })) }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => cell(c, { width: colWidths[i], fill: ri % 2 === 1 ? "F4F6FA" : undefined })),
      })),
    ],
  });
}
function callout(title, body, fill = "EAF2EA", bar = GREEN) {
  return new Table({
    width: { size: 8800, type: WidthType.DXA },
    columnWidths: [8800],
    rows: [new TableRow({ children: [ new TableCell({
      width: { size: 8800, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 18, color: bar },
      },
      children: [
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: title, bold: true, size: 22, color: NAVY })] }),
        new Paragraph({ spacing: { after: 0, line: 288 }, children: [new TextRun({ text: body, size: 21 })] }),
      ],
    })]})],
  });
}

const children = [];

// ---- Cover ----
children.push(
  new Paragraph({ spacing: { before: 1700, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "How the App Works", bold: true, size: 58, color: NAVY })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "A Plain-English Guide to the Backend and Its Security", size: 28, color: GREY })] }),
  new Paragraph({ spacing: { before: 60, after: 500 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Gridiron — Sports Pool Platform", size: 24, italics: true, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 10 } },
    spacing: { before: 200, after: 300 }, children: [new TextRun({ text: "", size: 2 })] }),
);
children.push(P("Written for anyone — no technical background needed. If you can follow how a shop takes a card payment, you can follow this.", { align: AlignmentType.CENTER, italics: true, color: GREY }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Contents ----
children.push(H1("What's inside"));
children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-1" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Part 1: What is the backend ----
children.push(H1("1. First, what is the “backend”?"));
children.push(P("Every app really has two halves."));
children.push(bullet([T("The front end", { bold: true }), T(" is what you see and tap on — the buttons, the screens, the colours. It runs on your phone or in your web browser.")]));
children.push(bullet([T("The backend", { bold: true }), T(" is the part you never see. It lives on secure computers (“servers”) and does the serious work: checking who you are, taking payments, keeping score, and storing everyone's money and results safely.")]));
children.push(P("Think of a restaurant. The front end is the dining room and the menu. The backend is the kitchen, the till, and the safe in the back office. This guide is about the kitchen and the safe."));
children.push(callout(
  "The one golden rule",
  "The backend never trusts what it is told. If your phone says “charge me $20” or “I won,” the backend ignores that and checks for itself. Everything below flows from this single idea.",
  "EAF2EA", GREEN
));

// ---- Part 2: What the app does ----
children.push(H1("2. What the app actually does"));
children.push(P("Gridiron lets people play prediction pools on NFL games. In everyday terms:"));
children.push(bullet([T("A ", ), T("pool", { bold: true }), T(" is a game with an entry fee. Everyone who pays goes into the same prize pot.")]));
children.push(bullet([T("A ", ), T("card", { bold: true }), T(" is your entry. On it you predict the winners of a set of games.")]));
children.push(bullet([T("When the real games finish, the app works out who predicted best and ", ), T("pays the winners", { bold: true }), T(" from the pot.")]));

children.push(H2("The journey from sign-up to payout"));
children.push(step("1. Sign up", "You create an account with an email and a strong password. The app confirms it's really you."));
children.push(step("2. Join a pool", "You pick a pool and pay the entry fee by card. The payment is handled by Stripe, a trusted payment company (the same kind used by countless online shops)."));
children.push(step("3. Get your card", "Only after the payment truly clears does the app give you an entry card."));
children.push(step("4. Make your picks", "You predict the games. You can change your mind right up until each game starts — then your picks for that game lock."));
children.push(step("5. Games are played", "The app automatically pulls the real, final scores from the official sports feed."));
children.push(step("6. Settle up", "Once every game in a pool is finished, the app scores all the cards, decides the winner(s), and adds their winnings to their in-app balance."));
children.push(step("7. Cash out", "You request a withdrawal, and an administrator sends your money to your PayPal."));
children.push(callout(
  "Why the order matters",
  "Notice you only get a card after paying, and you can only pick before a game starts. Those two rules stop the two most obvious ways to cheat: playing for free, and betting on a result you already know.",
  "EAF2FB", BLUE
));

// ---- Part 3: The security layers ----
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("3. How many layers of security? Seven."));
children.push(P("Security here is not one lock on one door. It's built in layers, like a bank: a locked front door, a guard checking a list, and a vault that stays shut even if someone slips past the guard. If one layer is ever bypassed, the next one still holds."));
children.push(P("Here are the seven layers, in plain terms.", { after: 60 }));

children.push(table(
  [560, 2650, 5590],
  ["#", "Layer", "In plain English"],
  [
    ["1", "The front door (log in)", "You must prove who you are before doing anything that matters. Passwords must be strong."],
    ["2", "The guest list (permissions)", "Being logged in isn't enough. The app checks whether you're allowed to do this specific thing — and you can only ever touch your own account, cards, and money."],
    ["3", "The vault's own lock (database rules)", "Even if a mistake left a door open, the database itself refuses to hand out anyone else's private data or move money. It's a second, independent lock on the safe."],
    ["4", "The cashier (money handling)", "The app — not your phone — decides prices and amounts. Payments are confirmed with Stripe directly. You can't be charged the wrong amount, get a free entry, or be paid twice."],
    ["5", "Fair play (game integrity)", "Your predictions are private from other players, and lock the moment a game starts, so nobody can peek or bet on a known result."],
    ["6", "Robots & secrets", "Automatic behind-the-scenes jobs (like paying winners) require a secret password only our own systems know, and payment messages are checked for a genuine signature."],
    ["7", "Bouncer at the input (checking what comes in)", "Everything sent to the backend is inspected and cleaned first, so booby-trapped input can't trick the system."],
  ]
));

children.push(H2("A closer look at each layer"));

children.push(P("Layer 1 — The front door.", { bold: true, after: 40 }));
children.push(P("You sign in with your email and password, and passwords are required to be long and varied so they're hard to guess. Until you've signed in, the sensitive parts of the app simply don't answer you."));

children.push(P("Layer 2 — The guest list.", { bold: true, after: 40 }));
children.push(P("Logging in gets you in the building; it doesn't give you keys to every room. Before each action the backend asks, “Is this really your card? Your payout? Are you an administrator?” A normal player can never see another player's details or do an administrator's job."));

children.push(P("Layer 3 — The vault's own lock.", { bold: true, after: 40 }));
children.push(P("This is the strongest and most unusual protection here. The database that stores everyone's data has its own built-in rules about who may see or change each row of information. So even in the worst case — a bug in the app leaves a door ajar — the safe still won't open for the wrong person. Your card, your picks, your balance, and your email are walled off from everyone else by the storage system itself."));

children.push(P("Layer 4 — The cashier.", { bold: true, after: 40 }));
children.push(P("Money is where attackers try hardest, so it gets the most care:"));
children.push(bullet("The price of entering a pool is set by the pool, not by your phone — you can't offer to pay less."));
children.push(bullet("A card is only created after Stripe confirms the real payment landed, and the amount is double-checked against Stripe."));
children.push(bullet("Clever timing tricks can't create two cards for one payment, or pay a withdrawal twice — each payment and payout can only count once."));
children.push(bullet("Your balance is changed in a single, safe step, so two things happening at the same instant can never accidentally erase or duplicate money."));

children.push(P("Layer 5 — Fair play.", { bold: true, after: 40 }));
children.push(P("Other players cannot see your predictions, and you cannot see theirs. And once a game kicks off, picks for that game are frozen — so no one can wait to see what happened and then “predict” the winner."));

children.push(P("Layer 6 — Robots & secrets.", { bold: true, after: 40 }));
children.push(P("Some jobs run automatically on a schedule, such as settling finished pools and paying winners. These can be triggered only with a secret key that lives inside our own systems — an outsider can't set them off. And messages from the payment company are checked for a genuine digital signature, so a faked “payment received” message is rejected."));
children.push(callout(
  "“Fail closed” — a safety habit worth knowing",
  "If a security setting is ever missing, the backend refuses to run that action rather than guessing. It would rather do nothing than do something unsafe. In security, “stop” is the safe answer.",
  "FBF3E6", "B8860B"
));

children.push(P("Layer 7 — The bouncer at the input.", { bold: true, after: 40 }));
children.push(P("Anything sent to the backend is checked and cleaned before it's used — the right shape, sensible values, and nothing sneaky hidden inside. This stops a whole family of classic attacks that rely on smuggling instructions inside ordinary-looking text."));

// ---- Part 4: everyday reassurance ----
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("4. What this means for you"));
children.push(table(
  [4300, 4500],
  ["Your worry", "How the app protects you"],
  [
    ["“Could someone log in as me?”", "Strong passwords are required, and sensitive actions are locked behind sign-in."],
    ["“Could someone see my picks or balance?”", "Two separate layers keep your data private — the app's checks and the database's own locks."],
    ["“Could I be charged the wrong amount?”", "The price is fixed by the pool and confirmed with the payment company, not taken from your device."],
    ["“Could someone cheat to win?”", "Picks lock at kickoff and are hidden from rivals, so nobody can bet on a known result."],
    ["“Could a winner be paid twice, or not at all?”", "Each payment and payout counts exactly once, and winnings are worked out automatically from the real scores."],
    ["“Could an outsider trigger a payout?”", "Automatic money jobs need a secret only our own systems hold, and refuse to run if anything's missing."],
  ]
));

children.push(H1("5. The short version"));
children.push(P("The backend is the app's kitchen and safe: it takes payments, keeps score, and looks after everyone's money out of sight."));
children.push(P("It protects all of that with seven layers — a login, a permission check, a database that locks itself, a careful cashier for money, fair-play rules for the games, secret keys for its automatic jobs, and a bouncer that cleans everything coming in."));
children.push(runs([T("And it follows one golden rule throughout: ", ), T("never trust what you're told — always check.", { bold: true })]));

children.push(new Paragraph({ spacing: { before: 320 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 8 } },
  children: [new TextRun({ text: "Plain-language overview prepared for a non-technical audience. Internal use.", italics: true, size: 17, color: GREY })] }));

const doc = new Document({
  creator: "Gridiron",
  title: "How the App Works — Backend & Security, Explained Simply",
  description: "A plain-English guide to the backend logic and its seven layers of security",
  numbering: {
    config: [
      { reference: "dots", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } },
      ]},
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 300 } } } },
      ]},
    ],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 22, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 300, after: 150 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 26, bold: true, color: BLUE }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, bottom: 1200, left: 1400, right: 1400 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/user/sports_pool/Backend_Explained_Simply.docx", buf);
  console.log("WROTE", buf.length, "bytes");
});
