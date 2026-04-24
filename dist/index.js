#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var readline = __toESM(require("readline"));
var C = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  green: "\x1B[32m",
  red: "\x1B[31m",
  yellow: "\x1B[33m",
  cyan: "\x1B[36m",
  blue: "\x1B[34m",
  grey: "\x1B[90m"
};
var bold = (s) => `${C.bold}${s}${C.reset}`;
var dim = (s) => `${C.dim}${s}${C.reset}`;
var green = (s) => `${C.green}${s}${C.reset}`;
var red = (s) => `${C.red}${s}${C.reset}`;
var yellow = (s) => `${C.yellow}${s}${C.reset}`;
var cyan = (s) => `${C.cyan}${s}${C.reset}`;
var grey = (s) => `${C.grey}${s}${C.reset}`;
var blue = (s) => `${C.blue}${s}${C.reset}`;
function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : void 0;
}
function resolvePlansDir(args) {
  const custom = getArg(args, "--plans-dir");
  return custom ? path.resolve(process.cwd(), custom) : path.join(process.cwd(), "scripts", "plans");
}
function listPlans(plansDir) {
  if (!fs.existsSync(plansDir)) return [];
  return fs.readdirSync(plansDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js")).map((f) => f.replace(/\.(ts|js)$/, "")).sort();
}
function loadPlan(plansDir, planName) {
  const exts = [".ts", ".js"];
  const planPath = exts.map((e) => path.join(plansDir, planName + e)).find((p) => fs.existsSync(p));
  if (!planPath) {
    console.log(red(`Plan "${planName}" nicht gefunden in ${plansDir}`));
    console.log(grey(`Verf\xFCgbar: ${listPlans(plansDir).join(", ") || "(keine)"}`));
    process.exit(1);
  }
  const mod = require(planPath);
  return { steps: mod.TEST_STEPS, displayName: mod.PLAN_NAME ?? planName };
}
async function pickPlan(rl, plansDir) {
  const plans = listPlans(plansDir);
  if (plans.length === 0) {
    console.log(red(`Keine Testpl\xE4ne in ${plansDir} gefunden.`));
    console.log(grey("Lege .ts-Dateien mit TEST_STEPS-Export an oder \xFCbergib --plans-dir <pfad>."));
    process.exit(1);
  }
  if (plans.length === 1) return plans[0];
  console.log(bold("\nVerf\xFCgbare Testpl\xE4ne:\n"));
  plans.forEach((p, i) => console.log(`  ${grey(String(i + 1))}  ${cyan(p)}`));
  console.log();
  while (true) {
    const input = (await prompt(rl, `  Plan w\xE4hlen [1-${plans.length}]: `)).trim();
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < plans.length) return plans[idx];
    if (plans.includes(input)) return input;
  }
}
var RESULTS_DIR = path.join(process.cwd(), "test-results");
function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}
function gitHash() {
  try {
    return require("child_process").execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
function saveResults(session) {
  ensureResultsDir();
  const filename = `${session.date.replace(/[: ]/g, "-")}.md`;
  const file = path.join(RESULTS_DIR, filename);
  const pass = session.results.filter((r) => r.status === "pass").length;
  const fail = session.results.filter((r) => r.status === "fail").length;
  const skip = session.results.filter((r) => r.status === "skip").length;
  const total = session.results.length;
  const badge = fail === 0 ? `![pass](https://img.shields.io/badge/tests-${pass}%20passed-green)` : `![fail](https://img.shields.io/badge/tests-${fail}%20failed-red)`;
  const lines = [
    `# Test Results \u2014 ${session.date}`,
    ``,
    `**Plan:** ${session.plan}  `,
    `**Build:** \`${session.gitHash}\`  `,
    `**Result:** ${pass}/${total} passed \xB7 ${fail} failed \xB7 ${skip} skipped  `,
    badge,
    ``,
    `## Ergebnisse`,
    ``,
    `| ID | Phase | Test | Status | Notiz |`,
    `|----|-------|------|--------|-------|`
  ];
  for (const r of session.results) {
    const icon = r.status === "pass" ? "\u2705" : r.status === "fail" ? "\u274C" : "\u23ED";
    const note = r.note.replace(/\|/g, "\\|");
    lines.push(`| ${r.id} | ${r.phase} | ${r.title} | ${icon} | ${note} |`);
  }
  const failed = session.results.filter((r) => r.status === "fail");
  if (failed.length > 0) {
    lines.push(``, `## Fehlgeschlagene Tests`, ``);
    for (const r of failed) {
      lines.push(`### ${r.id} \u2014 ${r.title}`);
      if (r.note) lines.push(`> ${r.note}`);
      lines.push(``);
    }
  }
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}
function showLastResults() {
  ensureResultsDir();
  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".md")).sort().reverse();
  if (files.length === 0) {
    console.log(yellow("Noch keine Test-Ergebnisse gespeichert."));
    return;
  }
  console.log(bold("\nVorhandene Test-Sessions:\n"));
  files.slice(0, 10).forEach((f, i) => {
    const content = fs.readFileSync(path.join(RESULTS_DIR, f), "utf8");
    const resultLine = content.match(/\*\*Result:\*\* (.+)/)?.[1] ?? "";
    const planLine = content.match(/\*\*Plan:\*\* (.+)/)?.[1] ?? "";
    const planHint = planLine ? grey(` [${planLine.trim()}]`) : "";
    console.log(`  ${grey(String(i + 1).padStart(2, " "))}  ${cyan(f.replace(".md", ""))}${planHint}  ${dim(resultLine)}`);
  });
  console.log(`
${grey(`Dateien in: ${RESULTS_DIR}/`)}`);
}
function printHelp(plansDir) {
  console.log(`
${bold(cyan("manual-test \u2014 Interactive Manual Test Runner"))}

${bold("Usage:")}
  manual-test                              Testplan interaktiv w\xE4hlen
  manual-test --plan <name>               Testplan direkt laden
  manual-test --plan <name> --phase X     Nur Phase X testen
  manual-test --from <ID>                 Ab Schritt <ID> fortsetzen
  manual-test --plans-dir <pfad>          Alternatives Plan-Verzeichnis
  manual-test --results                   Letzte Sessions auflisten
  manual-test --help                      Diese Hilfe anzeigen

${bold("Verf\xFCgbare Pl\xE4ne:")} ${grey(`(${plansDir})`)}
${listPlans(plansDir).map((p) => `  ${cyan(p)}`).join("\n") || grey("  (keine)")}

${bold("Plan-Datei anlegen:")}
  // scripts/plans/my-feature.ts
  import type { TestStep } from '@pi-ano-man/manual-test'
  export const PLAN_NAME = 'My Feature'
  export const TEST_STEPS: TestStep[] = [ ... ]

${bold("Tasten w\xE4hrend eines Tests:")}
  ${grey("p")}  passed    (optionale Notiz)
  ${grey("f")}  failed    (Pflicht-Notiz)
  ${grey("s")}  skip
  ${grey("b")}  einen Schritt zur\xFCck
  ${grey("h")}  diese Hilfe anzeigen
  ${grey("q")}  Session abbrechen

${bold("Ergebnisse:")} test-results/YYYY-MM-DD-HH-mm.md
`);
}
function printHeader(planDisplayName) {
  console.clear();
  console.log(`${bold(cyan("\u2501".repeat(60)))}`);
  console.log(`  ${bold("Manual Tests")}  ${grey(planDisplayName)}`);
  console.log(`${bold(cyan("\u2501".repeat(60)))}
`);
  console.log(`  ${grey("p")} = passed   ${grey("f")} = failed   ${grey("s")} = skip   ${grey("b")} = zur\xFCck   ${grey("h")} = Hilfe   ${grey("q")} = abbrechen
`);
}
function printStep(step, index, total) {
  console.log(`
${cyan("\u2500".repeat(60))}`);
  console.log(`  ${grey(`[${index + 1}/${total}]`)}  ${bold(blue(step.phase))}`);
  console.log(`  ${bold(step.id)}  ${bold(step.title)}`);
  if (step.command) {
    console.log(`
${grey("  Befehl:")}`);
    for (const line of step.command.split("\n")) {
      console.log(`  ${yellow(line)}`);
    }
  }
  if (step.hint) {
    console.log(`
${grey("  Hinweis:")} ${dim(step.hint)}`);
  }
  console.log();
}
function statusIcon(s) {
  if (s === "pass") return green("\u2713 PASS");
  if (s === "fail") return red("\u2717 FAIL");
  return grey("\u23ED SKIP");
}
async function prompt(rl, question) {
  return new Promise((resolve2) => rl.question(question, (answer) => resolve2(answer.trim())));
}
async function run() {
  const args = process.argv.slice(2);
  const plansDir = resolvePlansDir(args);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp(plansDir);
    process.exit(0);
  }
  if (args.includes("--results")) {
    showLastResults();
    process.exit(0);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  const planArg = getArg(args, "--plan");
  const planName = planArg ?? await pickPlan(rl, plansDir);
  const { steps: allSteps, displayName } = loadPlan(plansDir, planName);
  const phaseFilter = getArg(args, "--phase")?.toUpperCase() ?? null;
  const fromId = getArg(args, "--from")?.toUpperCase() ?? null;
  let steps = allSteps;
  if (phaseFilter) {
    steps = steps.filter((s) => s.phase.toUpperCase().startsWith(phaseFilter));
    if (steps.length === 0) {
      console.log(red(`Keine Schritte f\xFCr Phase "${phaseFilter}" gefunden.`));
      rl.close();
      process.exit(1);
    }
  }
  if (fromId) {
    const idx = steps.findIndex((s) => s.id.toUpperCase() === fromId);
    if (idx === -1) {
      console.log(red(`Schritt "${fromId}" nicht gefunden.`));
      rl.close();
      process.exit(1);
    }
    steps = steps.slice(idx);
  }
  printHeader(displayName);
  const session = {
    date: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16),
    plan: displayName,
    gitHash: gitHash(),
    results: []
  };
  console.log(`  ${grey("Plan:")}    ${cyan(displayName)}`);
  console.log(`  ${grey("Build:")}   ${cyan(session.gitHash)}`);
  console.log(`  ${grey("Schritte:")} ${steps.length}${phaseFilter ? `  (Filter: Phase ${phaseFilter})` : ""}`);
  const startOverall = Date.now();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    printStep(step, i, steps.length);
    const startStep = Date.now();
    let input = "";
    while (!["p", "f", "s", "b", "q"].includes(input)) {
      input = (await prompt(rl, `  ${bold("Ergebnis")} [p/f/s/b/h/q]: `)).toLowerCase();
      if (input === "h") {
        printHelp(plansDir);
        input = "";
      }
    }
    if (input === "q") {
      console.log(yellow("\n  Test-Session abgebrochen."));
      break;
    }
    if (input === "b") {
      if (i === 0) {
        console.log(grey("  \u2190 Bereits erster Schritt."));
        i -= 1;
      } else {
        session.results.pop();
        i -= 2;
        console.log(grey("  \u2190 Zur\xFCck."));
      }
      continue;
    }
    const status = input === "p" ? "pass" : input === "f" ? "fail" : "skip";
    const durationMs = Date.now() - startStep;
    let note = "";
    if (status === "fail") note = await prompt(rl, `  ${red("Notiz")} (was ist schiefgelaufen?): `);
    else if (status === "pass") note = await prompt(rl, `  ${grey("Notiz")} (optional, Enter zum \xDCberspringen): `);
    session.results.push({ id: step.id, phase: step.phase, title: step.title, status, note, durationMs });
    console.log(`  \u2192 ${statusIcon(status)}${note ? grey("  " + note) : ""}`);
  }
  rl.close();
  const pass = session.results.filter((r) => r.status === "pass").length;
  const fail = session.results.filter((r) => r.status === "fail").length;
  const skip = session.results.filter((r) => r.status === "skip").length;
  const total = session.results.length;
  const elapsed = ((Date.now() - startOverall) / 1e3 / 60).toFixed(1);
  console.log(`
${bold(cyan("\u2501".repeat(60)))}`);
  console.log(`  ${bold("Zusammenfassung")}`);
  console.log(`${cyan("\u2501".repeat(60))}`);
  console.log(`  ${green(`\u2713 ${pass} bestanden`)}   ${fail > 0 ? red(`\u2717 ${fail} fehlgeschlagen`) : grey("\u2717 0 fehlgeschlagen")}   ${grey(`\u23ED ${skip} \xFCbersprungen`)}`);
  console.log(`  ${grey(`${total} Schritte in ${elapsed} min`)}`);
  if (fail > 0) {
    console.log(`
  ${bold(red("Fehlgeschlagen:"))}`);
    session.results.filter((r) => r.status === "fail").forEach((r) => console.log(`  ${red("\u2717")} ${bold(r.id)}  ${r.title}${r.note ? grey("  \u2192 " + r.note) : ""}`));
  }
  if (session.results.length > 0) {
    const file = saveResults(session);
    console.log(`
  ${grey("Ergebnisse gespeichert:")} ${cyan(path.relative(process.cwd(), file))}`);
  }
  console.log();
  process.exit(fail > 0 ? 1 : 0);
}
run().catch((err) => {
  console.error(red("Fehler: " + err.message));
  process.exit(1);
});
