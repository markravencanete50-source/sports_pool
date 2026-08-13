/**
 * Document generator guard.
 *
 * WHY THIS EXISTS. XML 1.0 forbids most control characters. C0 codes other than
 * tab (0x09), newline (0x0A) and carriage return (0x0D) simply cannot appear in
 * a well-formed document, and the `docx` writer does not sanitise them — it
 * emits whatever string it was handed straight into word/document.xml.
 *
 * The result is a .docx that every casual check passes and Word refuses to open:
 *
 *     Word experienced an error trying to open the file.
 *
 * That is exactly what happened here. Two vertical tabs (0x0B), used as an
 * ad-hoc line break in a note, made Gridiron_Project_Handover.docx unopenable —
 * and because the file unzips cleanly, reads fine as text, and was generated in
 * an environment with no Word, nothing caught it. The document was handed over
 * in that state. The combined document inherited the fault the moment it
 * imported that part.
 *
 * A line break inside a paragraph is `new TextRun({ break: 1 })`. It is never a
 * literal control character.
 *
 * The check is offline and instant, so it blocks a merge.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPTS = join(process.cwd(), "scripts");

/** Legal C0 characters in XML 1.0. Everything else below 0x20 is fatal. */
const LEGAL_CONTROL = new Set([0x09, 0x0a, 0x0d]);

interface Problem {
  file: string;
  offset: number;
  code: string;
  context: string;
}

function scan(file: string, source: string): Problem[] {
  const problems: Problem[] = [];

  for (let i = 0; i < source.length; i++) {
    const cc = source.charCodeAt(i);

    // C0 controls, plus DEL and the C1 block that XML also rejects unescaped.
    const illegal =
      (cc < 0x20 && !LEGAL_CONTROL.has(cc)) || cc === 0x7f || (cc >= 0x80 && cc <= 0x9f);

    if (!illegal) continue;

    problems.push({
      file,
      offset: i,
      code: `0x${cc.toString(16).toUpperCase().padStart(2, "0")}`,
      // Render the surrounding text with the offender visible.
      context: JSON.stringify(source.slice(Math.max(0, i - 50), i + 50)),
    });
  }

  return problems;
}

const files = readdirSync(SCRIPTS).filter((f) => f.endsWith(".cjs"));

if (files.length === 0) {
  console.error("\ndocs check FAILED — no generator scripts found; is the path right?\n");
  process.exit(1);
}

const problems = files.flatMap((f) => scan(f, readFileSync(join(SCRIPTS, f), "utf8")));

if (problems.length === 0) {
  console.log(`docs check passed — ${files.length} generators, no XML-illegal characters`);
  process.exit(0);
}

console.error(`\ndocs check FAILED — ${problems.length} XML-illegal character(s):\n`);
for (const p of problems) {
  console.error(`  [error] ${p.file} at offset ${p.offset}: ${p.code} is not valid in XML 1.0`);
  console.error(`          ...${p.context}...`);
  console.error(`          For a line break inside a paragraph use new TextRun({ break: 1 }).\n`);
}
process.exit(1);
