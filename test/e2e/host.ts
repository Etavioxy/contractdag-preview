import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'

const repoRoot = process.cwd()
const pollIntervalMs = 100
const suiteTimeoutMs = 60_000
const killTimeoutMs = 5_000
const tailLines = 20

interface RecordLine {
  event: string
  [key: string]: unknown
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

/** 等某几类记录出现，超时返回 undefined；等待必有限次且绑定终止条件。 */
async function waitForRecords(
  filePath: string,
  events: readonly string[],
  timeoutMs: number,
): Promise<RecordLine[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const seen = readRecords(filePath).filter((record) => events.includes(record.event))
    if (seen.length > 0) return seen
    await delay(pollIntervalMs)
  }
  return []
}

/** 只按 PID 收自己起的那个实例：先 SIGTERM，超时才 SIGKILL。 */
async function terminateSandbox(child: ChildProcess): Promise<string> {
  if (child.exitCode !== null || child.signalCode !== null) return 'already-exited'

  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
  child.kill('SIGTERM')
  const polite = await Promise.race([closed.then(() => 'closed' as const), delay(killTimeoutMs).then(() => 'timeout' as const)])
  if (polite === 'closed') return 'sigterm'

  child.kill('SIGKILL')
  const forced = await Promise.race([closed.then(() => 'closed' as const), delay(killTimeoutMs).then(() => 'timeout' as const)])
  return forced === 'closed' ? 'sigkill' : 'stuck'
}

function sandboxEnv(sinkFile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CONTRACTDAG_RECORD_SINK: sinkFile }
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
  const sinkFile = join(root, 'records.jsonl')

  console.log(`sandbox root: ${root}`)
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
  let termination = 'not-needed'
  try {
    const suiteRecords = await waitForRecords(sinkFile, ['suite-ready', 'suite-error'], suiteTimeoutMs)
    termination = await terminateSandbox(child)

    const records = readRecords(sinkFile)
    const events = records.map((record) => record.event)
    const present = (event: string): boolean => events.includes(event)
    const failure = suiteRecords.find((record) => record.event === 'suite-error')

    const checks: Array<[string, boolean]> = [
      ['activation 写过 activated', present('activated')],
      ['命令写过 dump', present('dump')],
      ['沙盒报过 suite-ready', present('suite-ready')],
      ['沙盒没报 suite-error', failure === undefined],
      ['按 PID 终止了实例', termination === 'sigterm' || termination === 'sigkill'],
    ]
    verdict = checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL'

    console.log(`elapsed: ${Date.now() - startedAt}ms  termination: ${termination}`)
    for (const record of records) console.log(`  record ${JSON.stringify(record)}`)
    for (const [label, ok] of checks) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
    if (verdict === 'FAIL') {
      console.log(`--- stdout tail ---\n${stdout.join('').split('\n').slice(-tailLines).join('\n')}`)
      console.log(`--- stderr tail ---\n${stderr.join('').split('\n').slice(-tailLines).join('\n')}`)
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }

  console.log(`verdict: ${verdict}`)
  if (verdict !== 'PASS') process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
