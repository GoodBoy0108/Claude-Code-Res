import { randomUUID } from 'node:crypto'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  resolveHookPermissionDecision,
  runPreToolUseHooks,
} from '../../services/tools/toolHooks.js'
import type { AssistantMessage, AttachmentMessage, SystemMessage, UserMessage } from '../../types/message.js'
import type { Tool, ToolResult, ToolUseContext } from '../../Tool.js'
import {
  createAssistantMessage,
  createToolResultStopMessage,
  createUserMessage,
} from '../../utils/messages.js'

type VirtualMessage = UserMessage | AssistantMessage | AttachmentMessage | SystemMessage

type ToolWrapper = {
  name: string
  description: string
  schema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

function markVirtual(message: VirtualMessage): VirtualMessage {
  return { ...message, isVirtual: true }
}

function createVirtualToolUse(
  tool: Tool,
  input: Record<string, unknown>,
  toolUseID: string,
) {
  return createAssistantMessage({
    content: [
      {
        type: 'tool_use',
        id: toolUseID,
        name: tool.name,
        input,
      },
    ],
    isVirtual: true,
  })
}

function createVirtualToolError(
  assistantMessage: AssistantMessage,
  toolUseID: string,
  content: string,
) {
  return createUserMessage({
    content: [
      {
        type: 'tool_result',
        content,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ],
    toolUseResult: `Error: ${content}`,
    sourceToolAssistantUUID: assistantMessage.uuid,
    isVirtual: true,
  })
}

export async function createToolWrappers({
  tools,
  context,
  canUseTool,
  parentMessage,
  onToolStart,
  onVirtualMessages,
}: {
  tools: readonly Tool[]
  context: ToolUseContext
  canUseTool: CanUseToolFn
  parentMessage: AssistantMessage
  onToolStart: (toolName: string, toolInput: Record<string, unknown>) => void
  onVirtualMessages: (messages: VirtualMessage[]) => void
}): Promise<ToolWrapper[]> {
  return Promise.all(
    tools.map(async tool => ({
      name: tool.name,
      description: await tool.description({} as never, {
        isNonInteractiveSession: context.options.isNonInteractiveSession,
        toolPermissionContext: context.getAppState().toolPermissionContext,
        tools: context.options.tools,
      }),
      schema: tool.inputJSONSchema ?? tool.inputSchema.toJSON(),
      handler: async (args: Record<string, unknown>) => {
        const toolUseID = `repl_${tool.name}_${randomUUID()}`
        let processedInput = args
        let hookPermissionResult
        let stopReason: string | undefined

        for await (const result of runPreToolUseHooks(
          context,
          tool,
          processedInput,
          toolUseID,
          parentMessage.message.id,
          undefined,
          undefined,
          undefined,
        )) {
          switch (result.type) {
            case 'message':
              if (result.message.message.type !== 'progress') {
                onVirtualMessages([markVirtual(result.message.message)])
              }
              break
            case 'hookPermissionResult':
              hookPermissionResult = result.hookPermissionResult
              break
            case 'hookUpdatedInput':
              processedInput = result.updatedInput
              break
            case 'stopReason':
              stopReason = result.stopReason
              break
            case 'stop': {
              const virtualToolUse = createVirtualToolUse(
                tool,
                processedInput,
                toolUseID,
              )
              const virtualStop = createUserMessage({
                content: [createToolResultStopMessage(toolUseID)],
                toolUseResult: `Error: ${stopReason}`,
                sourceToolAssistantUUID: virtualToolUse.uuid,
                isVirtual: true,
              })
              onVirtualMessages([virtualToolUse, virtualStop])
              throw new Error(stopReason ?? 'Execution stopped by hook')
            }
          }
        }

        const resolved = await resolveHookPermissionDecision(
          hookPermissionResult,
          tool,
          processedInput,
          context,
          canUseTool,
          parentMessage,
          toolUseID,
        )
        processedInput = resolved.input

        const virtualToolUse = createVirtualToolUse(tool, processedInput, toolUseID)

        if (resolved.decision.behavior !== 'allow') {
          const errorContent = resolved.decision.message ?? 'Permission denied'
          onVirtualMessages([
            virtualToolUse,
            createVirtualToolError(virtualToolUse, toolUseID, errorContent),
          ])
          throw new Error(errorContent)
        }

        onToolStart(tool.name, processedInput)

        try {
          const result: ToolResult<unknown> = await tool.call(
            processedInput as never,
            context,
            canUseTool,
            parentMessage,
          )
          const virtualToolResult = createUserMessage({
            content: [
              tool.mapToolResultToToolResultBlockParam(
                result.data as never,
                toolUseID,
              ),
            ],
            toolUseResult: result.data,
            sourceToolAssistantUUID: virtualToolUse.uuid,
            isVirtual: true,
          })
          onVirtualMessages([
            virtualToolUse,
            virtualToolResult,
            ...((result.newMessages ?? []).map(message => markVirtual(message)) as VirtualMessage[]),
          ])
          return result.data
        } catch (error) {
          const content = error instanceof Error ? error.message : String(error)
          onVirtualMessages([
            virtualToolUse,
            createVirtualToolError(virtualToolUse, toolUseID, content),
          ])
          throw error
        }
      },
    })),
  )
}
