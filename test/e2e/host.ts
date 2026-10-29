import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'

const repoRoot = process.cwd()
const scenario = process.argv[2] ?? 's1'
const pollIntervalMs = 100
const suiteWindowsMs = [5_000, 15_000, 30_000]
const killTimeoutMs = 5_000
const tailLines = 20

/** 每个剧本至少要留下哪类记录，别的判据都由剧本自己的 check 说。 */
const requiredRecords: Record<string, string[]> = {
  s1: ['dump'],
  s2: ['dump'],
  s3: ['inspect'],
  s4: ['layout'],
  s5: ['preview', 'preview-state'],
  s6: ['preview', 'preview-state', 'reveal', 'expand-request'],
  s7: ['preview', 'preview-state', 'reveal', 'preview-close'],
}

interface RecordLine {
  event: string
  [key: string]: unknown
}

interface SandboxClose {
  how: 'already-exited' | 'sigterm' | 'sigkill' | 'stuck'
  code: number | null
  signal: NodeJS.Signals | null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readRecords(filePath: string): RecordLine[] {
  if (!existsSync(filePath)) return []
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RecordLine)
}

/** 在给定窗口里等某几类记录；窗口到期返回空，由调用方决定要不要接着等。 */
async function waitForRecords(
  filePath: string,
  events: readonly string[],
  windowMs: number,
): Promise<RecordLine[]> {
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline) {
    const seen = readRecords(filePath).filter((record) => events.includes(record.event))
    if (seen.length > 0) return seen
    await delay(pollIntervalMs)
  }
  return []
}

/** 超时从小起步逐级放大，每级到期都记一笔，卡住时能看出停在哪。 */
async function waitForSuite(filePath: string): Promise<{ records: RecordLine[]; expired: number[] }> {
  const expired: number[] = []
  const startedAt = Date.now()

  for (const window of suiteWindowsMs) {
    const records = await waitForRecords(filePath, ['suite-ready', 'suite-error'], window)
    if (records.length > 0) return { records, expired }
    expired.push(Date.now() - startedAt)
  }

  return { records: [], expired }
}

/** 只按 PID 收自己起的那个实例：先 SIGTERM，超时才 SIGKILL。 */
async function terminateSandbox(child: ChildProcess): Promise<SandboxClose> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { how: 'already-exited', code: child.exitCode, signal: child.signalCode }
  }

  let close: [number | null, NodeJS.Signals | null] = [null, null]
  const closed = new Promise<void>((resolve) =>
    child.once('close', (code, signal) => {
      close = [code, signal]
      resolve()
    }),
  )
  child.kill('SIGTERM')
  const polite = await Promise.race([closed.then(() => 'closed' as const), delay(killTimeoutMs).then(() => 'timeout' as const)])
  if (polite === 'closed') return { how: 'sigterm', code: close[0], signal: close[1] }

  child.kill('SIGKILL')
  const forced = await Promise.race([closed.then(() => 'closed' as const), delay(killTimeoutMs).then(() => 'timeout' as const)])
  return { how: forced === 'closed' ? 'sigkill' : 'stuck', code: close[0], signal: close[1] }
}

/** 只清自己建在系统临时目录下、带固定前缀的那个目录。 */
function cleanupSandbox(root: string): 'done' | 'kept' | 'skipped' {
  if (!root.startsWith(tmpdir()) || !basename(root).startsWith('contractdag-e2e-')) return 'skipped'
  rmSync(root, { recursive: true, force: true })
  return existsSync(root) ? 'kept' : 'done'
}

function sandboxEnv(sinkFile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONTRACTDAG_RECORD_SINK: sinkFile,
    CONTRACTDAG_E2E_SCENARIO: scenario,
    CONTRACTDAG_E2E_FIXTURE: join(repoRoot, 'test/fixtures/deploy.contractdag'),
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('VSCODE_') || key === 'ELECTRON_RUN_AS_NODE') delete env[key]
  }
  return env
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'contractdag-e2e-'))
  const userDataDir = join(root, 'user-data')
  const extensionsDir = join(root, 'extensions')
  const workspaceDir = join(root, 'workspace')
  for (const dir of [userDataDir, extensionsDir, workspaceDir]) mkdirSync(dir, { recursive: true })

  // 整条用户路径要在一个真工作区上走：把样例复制进去，当作作者自己写的那份契约。
  const workspaceFile = join(workspaceDir, 'pipeline.contractdag')
  copyFileSync(join(repoRoot, 'test/fixtures/deploy.contractdag'), workspaceFile)
  const sinkFile = join(root, 'records.jsonl')

  console.log(`sandbox root: ${root}`)
  console.log(`workspace file: ${workspaceFile}`)
  const codePath = process.env['CONTRACTDAG_CODE_PATH'] ?? (await downloadAndUnzipVSCode())
  if (!existsSync(codePath)) throw new Error(`VS Code 可执行文件不存在：${codePath}`)

  const args = [
    `--extensionDevelopmentPath=${repoRoot}`,
    `--extensionTestsPath=${join(repoRoot, 'dist/test/e2e/suite.cjs')}`,
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
    workspaceDir,
  ]

  const child = spawn(codePath, args, { env: sandboxEnv(sinkFile), stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => stdout.push(chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => stderr.push(chunk))
  console.log(`sandbox pid: ${child.pid ?? 'unknown'}`)

  const startedAt = Date.now()
  let verdict = 'FAIL'
  let termination: SandboxClose = { how: 'stuck', code: null, signal: null }
  let cleanup = 'kept'

  try {
    const suite = await waitForSuite(sinkFile)
    termination = await terminateSandbox(child)

    const records = readRecords(sinkFile)
    const events = records.map((record) => record.event)
    const present = (event: string): boolean => events.includes(event)
    const failure = suite.records.find((record) => record.event === 'suite-error')
    const checkRecords = records.filter((record) => record.event === 'check')
    const failedChecks = checkRecords.filter((record) => record['ok'] !== true)

    const bodyChecks: Array<[string, boolean]> = [
      ['activation 写过 activated', present('activated')],
      ...(requiredRecords[scenario] ?? []).map((event): [string, boolean] => [`命令写过 ${event}`, present(event)]),
      ['剧本在时限内报出结果', suite.records.length > 0],
      ['沙盒报过 suite-ready', present('suite-ready')],
      ['沙盒没报 suite-error', failure === undefined],
      ['剧本的检查项全过', failedChecks.length === 0],
      ['按 PID 终止了实例', termination.how === 'sigterm' || termination.how === 'sigkill'],
      ['观察到实例已关闭', child.exitCode !== null || child.signalCode !== null],
    ]
    if (scenario !== 's1') bodyChecks.push(['剧本留下了检查项', checkRecords.length > 0])

    // 收尾本身也是判据：通过才清、清干净才算过；没过则留下现场供查。
    cleanup = bodyChecks.every(([, ok]) => ok) ? cleanupSandbox(root) : 'kept'
    const checks: Array<[string, boolean]> = [...bodyChecks, ['临时目录已清空', cleanup === 'done']]
    verdict = checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL'

    console.log(`elapsed: ${Date.now() - startedAt}ms  termination: ${termination.how}`)
    if (suite.expired.length > 0) console.log(`timeout windows expired at: ${suite.expired.join('ms, ')}ms`)
    console.log(`sandbox close: code=${String(termination.code)} signal=${String(termination.signal)}`)
    for (const record of records) console.log(`  record ${JSON.stringify(record)}`)
    for (const record of checkRecords) console.log(`  check ${record['ok'] === true ? 'ok  ' : 'FAIL'} ${String(record['name'])}`)
    for (const [label, ok] of checks) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
    if (verdict === 'FAIL') {
      console.log(`--- stdout tail ---\n${stdout.join('').split('\n').slice(-tailLines).join('\n')}`)
      console.log(`--- stderr tail ---\n${stderr.join('').split('\n').slice(-tailLines).join('\n')}`)
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }

  console.log(`cleanup: ${cleanup}${cleanup === 'kept' ? `  （现场留在 ${root}）` : ''}`)
  console.log(`script exit: ${verdict === 'PASS' ? 0 : 1}`)
  console.log(`verdict: ${verdict}`)
  if (verdict !== 'PASS') process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
