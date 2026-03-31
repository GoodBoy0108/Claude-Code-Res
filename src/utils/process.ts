import { isatty } from 'tty'
import { execSync_DEPRECATED } from './execSyncWrapper.js'
import { isRunningWithBun } from './bundledMode.js'

type TtyLikeStream = {
  fd?: number
  isTTY?: boolean
  setRawMode?: (mode: boolean) => void
  getWindowSize?: () => [number, number]
  columns?: number
  rows?: number
}

let cachedWindowsConsoleState:
  | { stdin: boolean; stdout: boolean; stderr: boolean }
  | undefined

function getWindowsConsoleState() {
  if (cachedWindowsConsoleState) {
    return cachedWindowsConsoleState
  }

  try {
    const [stdin, stdout, stderr] = execSync_DEPRECATED(
      'powershell -NoProfile -Command "[Console]::IsInputRedirected; [Console]::IsOutputRedirected; [Console]::IsErrorRedirected"',
      { encoding: 'utf8' },
    )
      .trim()
      .split(/\r?\n/)
      .map(line => line.trim().toLowerCase() === 'false')

    cachedWindowsConsoleState = { stdin, stdout, stderr }
  } catch {
    cachedWindowsConsoleState = { stdin: false, stdout: false, stderr: false }
  }

  return cachedWindowsConsoleState
}

function inferIsTTY(stream: TtyLikeStream, kind: 'stdin' | 'stdout' | 'stderr') {
  if (stream.isTTY !== undefined) {
    return
  }

  if (typeof stream.fd === 'number' && isatty(stream.fd)) {
    stream.isTTY = true
    return
  }

  if (stream.fd !== undefined) {
    return
  }

  if (kind === 'stdin') {
    if (typeof stream.setRawMode === 'function') {
      stream.isTTY = true
    }
    return
  }

  const hasWindowSize = typeof stream.getWindowSize === 'function'
  const hasDimensions =
    typeof stream.columns === 'number' && typeof stream.rows === 'number'

  if (hasWindowSize || hasDimensions) {
    stream.isTTY = true
  }
}

export function normalizeTtyStreams(
  stdin: TtyLikeStream,
  stdout: TtyLikeStream,
  stderr: TtyLikeStream,
): void {
  if (process.platform !== 'win32' || !isRunningWithBun()) {
    return
  }

  inferIsTTY(stdin, 'stdin')
  inferIsTTY(stdout, 'stdout')
  inferIsTTY(stderr, 'stderr')

  const consoleState = getWindowsConsoleState()
  if (consoleState.stdin) {
    stdin.isTTY = true
  }
  if (consoleState.stdout) {
    stdout.isTTY = true
  }
  if (consoleState.stderr) {
    stderr.isTTY = true
  }
}

export function normalizeProcessTtyStreams(): void {
  normalizeTtyStreams(process.stdin, process.stdout, process.stderr)
}

function handleEPIPE(
  stream: NodeJS.WriteStream,
): (err: NodeJS.ErrnoException) => void {
  return (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      stream.destroy()
    }
  }
}

// Prevents memory leak when pipe is broken (e.g., `claude -p | head -1`)
export function registerProcessOutputErrorHandlers(): void {
  process.stdout.on('error', handleEPIPE(process.stdout))
  process.stderr.on('error', handleEPIPE(process.stderr))
}

function writeOut(stream: NodeJS.WriteStream, data: string): void {
  if (stream.destroyed) {
    return
  }

  // Note: we don't handle backpressure (write() returning false).
  //
  // We should consider handling the callback to ensure we wait for data to flush.
  stream.write(data /* callback to handle here */)
}

export function writeToStdout(data: string): void {
  writeOut(process.stdout, data)
}

export function writeToStderr(data: string): void {
  writeOut(process.stderr, data)
}

// Write error to stderr and exit with code 1. Consolidates the
// console.error + process.exit(1) pattern used in entrypoint fast-paths.
export function exitWithError(message: string): never {
  // biome-ignore lint/suspicious/noConsole:: intentional console output
  console.error(message)
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(1)
}

// Wait for a stdin-like stream to close, but give up after ms if no data ever
// arrives. First data chunk cancels the timeout — after that, wait for end
// unconditionally (caller's accumulator needs all chunks, not just the first).
// Returns true on timeout, false on end. Used by -p mode to distinguish a
// real pipe producer from an inherited-but-idle parent stdin.
export function peekForStdinData(
  stream: NodeJS.EventEmitter,
  ms: number,
): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const done = (timedOut: boolean) => {
      clearTimeout(peek)
      stream.off('end', onEnd)
      stream.off('data', onFirstData)
      void resolve(timedOut)
    }
    const onEnd = () => done(false)
    const onFirstData = () => clearTimeout(peek)
    // eslint-disable-next-line no-restricted-syntax -- not a sleep: races timeout against stream end/data events
    const peek = setTimeout(done, ms, true)
    stream.once('end', onEnd)
    stream.once('data', onFirstData)
  })
}
