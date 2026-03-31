import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'

const TOOL_NAME = 'suggest_background_pr'

const inputSchema = z.strictObject({
  task_id: z.string().optional(),
  session_id: z.string().optional(),
  branch: z.string().optional(),
  pr_url: z.string().optional(),
  reason: z.string().optional(),
})
type InputSchema = typeof inputSchema

type Output = {
  success: boolean
  message: string
  task_id?: string
  pr_url?: string
}

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  task_id: z.string().optional(),
  pr_url: z.string().optional(),
})
type OutputSchema = typeof outputSchema

export const SuggestBackgroundPRTool = buildTool({
  name: TOOL_NAME,
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
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.reason ?? input.pr_url ?? input.branch ?? ''
  },
  async description() {
    return 'Suggest creating or tracking a pull request for background work.'
  },
  async prompt() {
    return 'Use this tool when background work has naturally reached pull-request stage and you need to surface that suggestion in structured form.'
  },
  renderToolUseMessage() {
    return null
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.message,
    }
  },
  async call(input) {
    return {
      data: {
        success: true,
        task_id: input.task_id,
        pr_url: input.pr_url,
        message: input.pr_url
          ? `Background PR noted: ${input.pr_url}`
          : input.branch
            ? `Background work on ${input.branch} is ready for a PR.`
            : 'Background work is ready for a PR.',
      },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
