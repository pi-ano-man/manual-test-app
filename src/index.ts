import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import type { TestStep } from './types'

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  grey:   '\x1b[90m',
}

const bold   = (s: string) => `${C.bold}${s}${C.reset}`
const dim    = (s: string) => `${C.dim}${s}${C.reset}`
const green  = (s: string) => `${C.green}${s}${C.reset}`
const red    = (s: string) => `${C.red}${s}${C.reset}`
const yellow = (s: string) => `${C.yellow}${s}${C.reset}`
const cyan   = (s: string) => `${C.cyan}${s}${C.reset}`
const grey   = (s: string) => `${C.grey}${s}${C.reset}`
const blue   = (s: string) => `${C.blue}${s}${C.reset}`

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = 'pass' | 'fail' | 'skip'

interface StepResult {
  id: string
  phase: string
  title: string
  status: Status
  note: string
  durationMs: number
}

interface TestSession {
  date: string
  plan: string
  gitHash: string
  results: StepResult[]
}

// ── Args ──────────────────────────────────────────────────────────────────────
function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : undefined
}

// ── Plan loading ──────────────────────────────────────────────────────────────
function resolvePlansDir(args: string[]): string {
  const custom = getArg(args, '--plans-dir')
  return custom
    ? path.resolve(process.cwd(), custom)
    : path.join(process.cwd(), 'scripts', 'plans')
}

function listPlans(plansDir: string): string[] {
  if (!fs.existsSync(plansDir)) return []
  return fs.readdirSync(plansDir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    .map(f => f.replace(/\.(ts|js)$/, ''))
    .sort()
}

function loadPlan(plansDir: string, planName: string): { steps: TestStep[]; displayName: string } {
  const exts = ['.ts', '.js']
  const planPath = exts.map(e => path.join(plansDir, planName + e)).find(p => fs.existsSync(p))
  if (!planPath) {
    console.log(red(`Plan "${planName}" nicht gefunden in ${plansDir}`))
    console.log(grey(`Verfügbar: ${listPlans(plansDir).join(', ') || '(keine)'}`))
    process.exit(1)
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(planPath) as { TEST_STEPS: TestStep[]; PLAN_NAME?: string }
  return { steps: mod.TEST_STEPS, displayName: mod.PLAN_NAME ?? planName }
}

async function pickPlan(rl: readline.Interface, plansDir: string): Promise<string> {
  const plans = listPlans(plansDir)
  if (plans.length === 0) {
    console.log(red(`Keine Testpläne in ${plansDir} gefunden.`))
    console.log(grey('Lege .ts-Dateien mit TEST_STEPS-Export an oder übergib --plans-dir <pfad>.'))
    process.exit(1)
  }
  if (plans.length === 1) return plans[0]

  console.log(bold('\nVerfügbare Testpläne:\n'))
  plans.forEach((p, i) => console.log(`  ${grey(String(i + 1))}  ${cyan(p)}`))
  console.log()

  while (true) {
    const input = (await prompt(rl, `  Plan wählen [1-${plans.length}]: `)).trim()
    const idx = parseInt(input, 10) - 1
    if (idx >= 0 && idx < plans.length) return plans[idx]
    if (plans.includes(input)) return input
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const RESULTS_DIR = path.join(process.cwd(), 'test-results')

function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true })
}

function gitHash(): string {
  try {
    return require('child_process')
      .execSync('git rev-parse --short HEAD', { encoding: 'utf8' })
      .trim()
  } catch { return 'unknown' }
}

function saveResults(session: TestSession) {
  ensureResultsDir()
  const filename = `${session.date.replace(/[: ]/g, '-')}.md`
  const file = path.join(RESULTS_DIR, filename)

  const pass  = session.results.filter(r => r.status === 'pass').length
  const fail  = session.results.filter(r => r.status === 'fail').length
  const skip  = session.results.filter(r => r.status === 'skip').length
  const total = session.results.length

  const badge = fail === 0
    ? `![pass](https://img.shields.io/badge/tests-${pass}%20passed-green)`
    : `![fail](https://img.shields.io/badge/tests-${fail}%20failed-red)`

  const lines: string[] = [
    `# Test Results — ${session.date}`,
    ``,
    `**Plan:** ${session.plan}  `,
    `**Build:** \`${session.gitHash}\`  `,
    `**Result:** ${pass}/${total} passed · ${fail} failed · ${skip} skipped  `,
    badge,
    ``,
    `## Ergebnisse`,
    ``,
    `| ID | Phase | Test | Status | Notiz |`,
    `|----|-------|------|--------|-------|`,
  ]

  for (const r of session.results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭'
    const note = r.note.replace(/\|/g, '\\|')
    lines.push(`| ${r.id} | ${r.phase} | ${r.title} | ${icon} | ${note} |`)
  }

  const failed = session.results.filter(r => r.status === 'fail')
  if (failed.length > 0) {
    lines.push(``, `## Fehlgeschlagene Tests`, ``)
    for (const r of failed) {
      lines.push(`### ${r.id} — ${r.title}`)
      if (r.note) lines.push(`> ${r.note}`)
      lines.push(``)
    }
  }

  fs.writeFileSync(file, lines.join('\n'))
  return file
}

function showLastResults() {
  ensureResultsDir()
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()

  if (files.length === 0) {
    console.log(yellow('Noch keine Test-Ergebnisse gespeichert.'))
    return
  }

  console.log(bold('\nVorhandene Test-Sessions:\n'))
  files.slice(0, 10).forEach((f, i) => {
    const content = fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8')
    const resultLine = content.match(/\*\*Result:\*\* (.+)/)?.[1] ?? ''
    const planLine   = content.match(/\*\*Plan:\*\* (.+)/)?.[1] ?? ''
    const planHint   = planLine ? grey(` [${planLine.trim()}]`) : ''
    console.log(`  ${grey(String(i + 1).padStart(2, ' '))}  ${cyan(f.replace('.md', ''))}${planHint}  ${dim(resultLine)}`)
  })
  console.log(`\n${grey(`Dateien in: ${RESULTS_DIR}/`)}`)
}

function printHelp(plansDir: string) {
  console.log(`
${bold(cyan('manual-test — Interactive Manual Test Runner'))}

${bold('Usage:')}
  manual-test                              Testplan interaktiv wählen
  manual-test --plan <name>               Testplan direkt laden
  manual-test --plan <name> --phase X     Nur Phase X testen
  manual-test --from <ID>                 Ab Schritt <ID> fortsetzen
  manual-test --plans-dir <pfad>          Alternatives Plan-Verzeichnis
  manual-test --results                   Letzte Sessions auflisten
  manual-test --help                      Diese Hilfe anzeigen

${bold('Verfügbare Pläne:')} ${grey(`(${plansDir})`)}
${listPlans(plansDir).map(p => `  ${cyan(p)}`).join('\n') || grey('  (keine)')}

${bold('Plan-Datei anlegen:')}
  // scripts/plans/my-feature.ts
  import type { TestStep } from '@pi-ano-man/manual-test'
  export const PLAN_NAME = 'My Feature'
  export const TEST_STEPS: TestStep[] = [ ... ]

${bold('Tasten während eines Tests:')}
  ${grey('p')}  passed    (optionale Notiz)
  ${grey('f')}  failed    (Pflicht-Notiz)
  ${grey('s')}  skip
  ${grey('b')}  einen Schritt zurück
  ${grey('h')}  diese Hilfe anzeigen
  ${grey('q')}  Session abbrechen

${bold('Ergebnisse:')} test-results/YYYY-MM-DD-HH-mm.md
`)
}

function printHeader(planDisplayName: string) {
  console.clear()
  console.log(`${bold(cyan('━'.repeat(60)))}`)
  console.log(`  ${bold('Manual Tests')}  ${grey(planDisplayName)}`)
  console.log(`${bold(cyan('━'.repeat(60)))}\n`)
  console.log(`  ${grey('p')} = passed   ${grey('f')} = failed   ${grey('s')} = skip   ${grey('b')} = zurück   ${grey('h')} = Hilfe   ${grey('q')} = abbrechen\n`)
}

function printStep(step: TestStep, index: number, total: number) {
  console.log(`\n${cyan('─'.repeat(60))}`)
  console.log(`  ${grey(`[${index + 1}/${total}]`)}  ${bold(blue(step.phase))}`)
  console.log(`  ${bold(step.id)}  ${bold(step.title)}`)

  if (step.command) {
    console.log(`\n${grey('  Befehl:')}`)
    for (const line of step.command.split('\n')) {
      console.log(`  ${yellow(line)}`)
    }
  }

  if (step.hint) {
    console.log(`\n${grey('  Hinweis:')} ${dim(step.hint)}`)
  }
  console.log()
}

function statusIcon(s: Status) {
  if (s === 'pass') return green('✓ PASS')
  if (s === 'fail') return red('✗ FAIL')
  return grey('⏭ SKIP')
}

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const args = process.argv.slice(2)
  const plansDir = resolvePlansDir(args)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp(plansDir)
    process.exit(0)
  }

  if (args.includes('--results')) {
    showLastResults()
    process.exit(0)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  const planArg  = getArg(args, '--plan')
  const planName = planArg ?? await pickPlan(rl, plansDir)
  const { steps: allSteps, displayName } = loadPlan(plansDir, planName)

  const phaseFilter = getArg(args, '--phase')?.toUpperCase() ?? null
  const fromId      = getArg(args, '--from')?.toUpperCase() ?? null

  let steps = allSteps

  if (phaseFilter) {
    steps = steps.filter(s => s.phase.toUpperCase().startsWith(phaseFilter))
    if (steps.length === 0) {
      console.log(red(`Keine Schritte für Phase "${phaseFilter}" gefunden.`))
      rl.close(); process.exit(1)
    }
  }

  if (fromId) {
    const idx = steps.findIndex(s => s.id.toUpperCase() === fromId)
    if (idx === -1) {
      console.log(red(`Schritt "${fromId}" nicht gefunden.`))
      rl.close(); process.exit(1)
    }
    steps = steps.slice(idx)
  }

  printHeader(displayName)

  const session: TestSession = {
    date: new Date().toISOString().replace('T', ' ').slice(0, 16),
    plan: displayName,
    gitHash: gitHash(),
    results: [],
  }

  console.log(`  ${grey('Plan:')}    ${cyan(displayName)}`)
  console.log(`  ${grey('Build:')}   ${cyan(session.gitHash)}`)
  console.log(`  ${grey('Schritte:')} ${steps.length}${phaseFilter ? `  (Filter: Phase ${phaseFilter})` : ''}`)

  const startOverall = Date.now()

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    printStep(step, i, steps.length)

    const startStep = Date.now()

    let input = ''
    while (!['p', 'f', 's', 'b', 'q'].includes(input)) {
      input = (await prompt(rl, `  ${bold('Ergebnis')} [p/f/s/b/h/q]: `)).toLowerCase()
      if (input === 'h') { printHelp(plansDir); input = '' }
    }

    if (input === 'q') { console.log(yellow('\n  Test-Session abgebrochen.')); break }

    if (input === 'b') {
      if (i === 0) { console.log(grey('  ← Bereits erster Schritt.')); i -= 1 }
      else { session.results.pop(); i -= 2; console.log(grey('  ← Zurück.')) }
      continue
    }

    const status: Status = input === 'p' ? 'pass' : input === 'f' ? 'fail' : 'skip'
    const durationMs = Date.now() - startStep

    let note = ''
    if (status === 'fail') note = await prompt(rl, `  ${red('Notiz')} (was ist schiefgelaufen?): `)
    else if (status === 'pass') note = await prompt(rl, `  ${grey('Notiz')} (optional, Enter zum Überspringen): `)

    session.results.push({ id: step.id, phase: step.phase, title: step.title, status, note, durationMs })
    console.log(`  → ${statusIcon(status)}${note ? grey('  ' + note) : ''}`)
  }

  rl.close()

  const pass    = session.results.filter(r => r.status === 'pass').length
  const fail    = session.results.filter(r => r.status === 'fail').length
  const skip    = session.results.filter(r => r.status === 'skip').length
  const total   = session.results.length
  const elapsed = ((Date.now() - startOverall) / 1000 / 60).toFixed(1)

  console.log(`\n${bold(cyan('━'.repeat(60)))}`)
  console.log(`  ${bold('Zusammenfassung')}`)
  console.log(`${cyan('━'.repeat(60))}`)
  console.log(`  ${green(`✓ ${pass} bestanden`)}   ${fail > 0 ? red(`✗ ${fail} fehlgeschlagen`) : grey('✗ 0 fehlgeschlagen')}   ${grey(`⏭ ${skip} übersprungen`)}`)
  console.log(`  ${grey(`${total} Schritte in ${elapsed} min`)}`)

  if (fail > 0) {
    console.log(`\n  ${bold(red('Fehlgeschlagen:'))}`)
    session.results
      .filter(r => r.status === 'fail')
      .forEach(r => console.log(`  ${red('✗')} ${bold(r.id)}  ${r.title}${r.note ? grey('  → ' + r.note) : ''}`))
  }

  if (session.results.length > 0) {
    const file = saveResults(session)
    console.log(`\n  ${grey('Ergebnisse gespeichert:')} ${cyan(path.relative(process.cwd(), file))}`)
  }

  console.log()
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(err => {
  console.error(red('Fehler: ' + err.message))
  process.exit(1)
})
