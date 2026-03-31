import vm from 'node:vm'
import { z } from 'zod/v4'
import type { REPLToolProgress } from '../../types/tools.js'
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js'
import { REPL_TOOL_NAME } from './constants.js'
import { getReplPrimitiveTools } from './primitiveTools.js'
import { createToolWrappers } from './toolWrappers.js'

const inputSchema = z.strictObject({
  code: z.string().min(1),
})
type InputSchema = typeof inputSchema

type Output = {
  stdout: string
  stderr: string
  result?: string
}

const outputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  result: z.string().optional(),
})
type OutputSchema = typeof outputSchema

function formatResult(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function createReplContext() {
  const stdout: string[] = []
  const stderr: string[] = []

  const console = {
    log: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
    error: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
    info: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
    debug: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
    getStdout: () => stdout.join('\n'),
    getStderr: () => stderr.join('\n'),
    clear: () => {
      stdout.length = 0
      stderr.length = 0
    },
  }

  const registeredTools = new Map<
    string,
    {
      name: string
      description: string
      schema: Record<string, unknown>
      handler: (args: Record<string, unknown>) => Promise<unknown>
    }
  >()

  const vmContext = vm.createContext({
    console,
    globalThis: undefined,
  })
  vmContext.globalThis = vmContext

  return {
    vmContext,
    registeredTools,
    console,
  }
}

function getOrCreateReplState(context: ToolUseContext) {
  const current = context.getAppState().replContext
  if (current) return current

  const created = createReplContext()
  context.setAppState(prev => ({
    ...prev,
    replContext: created,
  }))
  return context.getAppState().replContext ?? created
}

export const REPLTool = buildTool({
  name: REPL_TOOL_NAME,
  maxResultSizeChars: 100_000,
  userFacingName() {
    return ''
  },
  get inputSchema(): InputSchema {
    return inputSchema
  },
  get outputSchema(): OutputSchema {
    return outputSchema
  },
  isConcurrencySafe() {
    return false
  },
  isTransparentWrapper() {
    return true
  },
  toAutoClassifierInput({ code }) {
    return code
  },
  async description() {
    return 'Run JavaScript in a persistent REPL context with access to Claude tools.'
  },
  async prompt() {
    return 'Run JavaScript in the persistent REPL context. Use the exposed tool wrappers to call hidden primitive tools.'
  },
  renderToolUseMessage() {
    return null
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const lines = [output.stdout, output.stderr, output.result]
      .filter(Boolean)
      .join('\n')
      .trim()

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines || 'REPL execution completed.',
    }
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    const replContext = getOrCreateReplState(context)
    const newMessages = []

    const wrappers = await createToolWrappers({
      tools: getReplPrimitiveTools(),
      context,
      canUseTool,
      parentMessage,
      onToolStart(toolName, toolInput) {
        onProgress?.({
          toolUseID: `repl_${parentMessage.message.id}`,
          data: {
            type: 'repl_tool_call',
            phase: 'start',
            toolName,
            toolInput,
          } satisfies REPLToolProgress,
        })
      },
      onVirtualMessages(messages) {
        newMessages.push(...messages)
      },
    })

    for (const wrapper of wrappers) {
      replContext.registeredTools.set(wrapper.name, wrapper)
      replContext.vmContext[wrapper.name] = wrapper.handler
    }

    replContext.vmContext.console = replContext.console
    replContext.console.clear()

    const script = new vm.Script(input.code)
    const result = await script.runInContext(replContext.vmContext)

    return {
      data: {
        stdout: replContext.console.getStdout(),
        stderr: replContext.console.getStderr(),
        result: formatResult(result),
      },
      newMessages,
    }
  },
} satisfies ToolDef<InputSchema, Output, REPLToolProgress>)
