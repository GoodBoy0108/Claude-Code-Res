import * as React from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js'
import { Box, Text } from '../../ink.js'
import { getCompanion, roll, rollWithSeed } from '../../buddy/companion.js'
import { RARITY_COLORS, RARITY_STARS, type Companion, type Species, type StoredCompanion } from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import type { AppState } from '../../state/AppStateStore.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

// Parse command arguments
function parseArgs(args: string): { subcommand: string; args: string[] } {
  const parts = args.trim().split(/\s+/)
  const subcommand = parts[0] || 'help'
  return { subcommand, args: parts.slice(1) }
}

// Render stat bar
function renderStatBar(name: string, value: number, width = 30): React.ReactNode {
  const filled = Math.round((value / 100) * width)
  const empty = width - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  return (
    <Box key={name}>
      <Box width={12}>
        <Text bold>{name}</Text>
      </Box>
      <Text>{bar}</Text>
      <Text dimColor> {value}</Text>
    </Box>
  )
}

// Render companion card
function renderCompanionCard(companion: Companion): React.ReactNode {
  const { rarity, species, shiny, hat, stats, name, personality, hatchedAt } = companion
  const stars = RARITY_STARS[rarity]
  const color = RARITY_COLORS[rarity]
  const sprite = renderSprite(companion, 0)

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box marginBottom={1}>
        <Text color={color} bold>
          {stars} {rarity.toUpperCase()}
          {shiny && ' ✨ SHINY'}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1} alignItems="center">
        {sprite.map((line, i) => (
          <Text key={i} bold={shiny}>
            {line}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold>Name: </Text>
          <Text>{name}</Text>
        </Box>
        <Box>
          <Text bold>Species: </Text>
          <Text>{species}</Text>
        </Box>
        {hat !== 'none' && (
          <Box>
            <Text bold>Hat: </Text>
            <Text>{hat}</Text>
          </Box>
        )}
        <Box>
          <Text bold>Hatched: </Text>
          <Text>{new Date(hatchedAt).toLocaleDateString()}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text italic dimColor>
          "{personality}"
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Stats:</Text>
        {renderStatBar('DEBUGGING', stats.DEBUGGING)}
        {renderStatBar('PATIENCE', stats.PATIENCE)}
        {renderStatBar('CHAOS', stats.CHAOS)}
        {renderStatBar('WISDOM', stats.WISDOM)}
        {renderStatBar('SNARK', stats.SNARK)}
      </Box>
    </Box>
  )
}

// Simple text card for narrow terminals
function renderCompanionCardText(companion: Companion): string {
  const { rarity, species, shiny, name, personality, stats } = companion
  const stars = RARITY_STARS[rarity]

  return `
${stars} ${rarity.toUpperCase()}${shiny ? ' ✨ SHINY' : ''}

Name: ${name}
Species: ${species}
Shiny: ${shiny ? 'Yes ✨' : 'No'}

"${personality}"

Stats:
  DEBUGGING: ${stats.DEBUGGING}/100
  PATIENCE:  ${stats.PATIENCE}/100
  CHAOS:     ${stats.CHAOS}/100
  WISDOM:    ${stats.WISDOM}/100
  SNARK:     ${stats.SNARK}/100
`
}

// AI generation prompt for hatch
function generateHatchPrompt(species: Species, rarity: string, stats: Record<string, number>): string {
  const statsText = Object.entries(stats)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')

  return `Generate a name and short personality for a ${species} companion.

Rarity: ${rarity}
Stats: ${statsText}

Respond ONLY with valid JSON in this exact format:
{
  "name": "Short creative name (2-12 letters)",
  "personality": "One sentence personality (20-60 chars)"
}

Be creative and fun! The personality should reflect the stats.`
}

// AI generation for companion soul (name + personality)
async function generateCompanionSoul(
  species: Species,
  rarity: string,
  stats: Record<string, number>,
  signal?: AbortSignal,
): Promise<{ name: string; personality: string }> {
  const config = getGlobalConfig()
  const apiKey = config.apiKey

  if (!apiKey) {
    // Fallback to random generation if no API key
    const names = [
      'Quackers', 'Waddles', 'Puddles', 'Feathers', 'Bubbles',
      'Sparkle', 'Ziggy', 'Mochi', 'Noodle', 'Pip',
      'Luna', 'Cosmo', 'Mittens', 'Pounce', 'Fuzzy',
    ]
    const personalities = [
      'A curious explorer with a heart of gold.',
      'Chaotic energy in a small, adorable package.',
      'Wise beyond their years, mostly naps though.',
      'Always hungry, always happy, always ready.',
      'A shy but loyal friend to the end.',
      'Expert debugger, expert snack eater.',
      'Chaos incarnate, but cute enough to get away with it.',
    ]

    return {
      name: names[Math.floor(Math.random() * names.length)],
      personality: personalities[Math.floor(Math.random() * personalities.length)],
    }
  }

  // Use Anthropic API for generation
  const prompt = generateHatchPrompt(species, rarity, stats)
  const model = config.model ?? 'claude-sonnet-4-20250514'

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || '{}'

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        name: parsed.name || 'Buddy',
        personality: parsed.personality || 'A mysterious companion.',
      }
    }
  } catch (error) {
    // Fallback on error
    console.error('Failed to generate companion soul:', error)
  }

  // Ultimate fallback
  return {
    name: species.charAt(0).toUpperCase() + species.slice(1),
    personality: `A friendly ${species} companion.`,
  }
}

// Hatch subcommand
async function handleHatch(
  args: string[],
  context: LocalJSXCommandContext,
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> {
  const config = getGlobalConfig()

  // Check if already hatched
  if (config.companion) {
    onDone('You already have a companion! Use `/buddy card` to see it.', {
      display: 'system',
    })
    return <Text>Companion already exists. Use `/buddy card` to view.</Text>
  }

  // Parse seed argument
  const seedIndex = args.indexOf('--seed')
  const seed = seedIndex >= 0 && args[seedIndex + 1] ? args[seedIndex + 1] : undefined

  // Roll companion bones
  const { bones } = seed ? rollWithSeed(seed) : roll(config.oauthAccount?.accountUuid ?? config.userID ?? 'anon')

  // Generate soul via AI
  const soul = await generateCompanionSoul(
    bones.species,
    bones.rarity,
    bones.stats,
    context.signal,
  )

  // Save to config
  const stored: StoredCompanion = {
    name: soul.name,
    personality: soul.personality,
    hatchedAt: Date.now(),
  }

  saveGlobalConfig((current) => ({
    ...current,
    companion: stored,
  }))

  const companion: Companion = { ...stored, ...bones }

  onDone(
    `Meet ${soul.name}, your ${bones.rarity} ${bones.species} companion! Use \`/buddy pet\` to interact.`,
    { display: 'system' },
  )

  return (
    <Box flexDirection="column">
      <Text color="success">🎉 Your companion has hatched!</Text>
      <Box marginTop={1}>{renderCompanionCard(companion)}</Box>
    </Box>
  )
}

// Pet subcommand
function handlePet(context: LocalJSXCommandContext, onDone: LocalJSXCommandOnDone): React.ReactNode {
  const companion = getCompanion()

  if (!companion) {
    onDone("You don't have a companion yet! Use `/buddy hatch` to get one.", {
      display: 'system',
    })
    return <Text>No companion hatched yet. Use `/buddy hatch` to start!</Text>
  }

  // Set pet timestamp via context.setAppState if available
  if ('setAppState' in context && typeof context.setAppState === 'function') {
    ;(context as { setAppState: (updater: (prev: AppState) => AppState) => void }).setAppState(
      (prev) => ({
        ...prev,
        companionPetAt: Date.now(),
      }),
    )
  }

  onDone(`You pet ${companion.name}! ❤️`, { display: 'system' })

  return (
    <Box flexDirection="column">
      <Text>
        ❤️ You pet <Text bold color={RARITY_COLORS[companion.rarity]}>{companion.name}</Text>!
      </Text>
      <Text dimColor>{companion.name} looks happy!</Text>
    </Box>
  )
}

// Card subcommand
function handleCard(args: string[], onDone: LocalJSXCommandOnDone): React.ReactNode {
  const companion = getCompanion()

  if (!companion) {
    onDone("You don't have a companion yet! Use `/buddy hatch` to get one.", {
      display: 'system',
    })
    return <Text>No companion hatched yet. Use `/buddy hatch` to start!</Text>
  }

  // Check for --json flag
  const jsonMode = args.includes('--json')
  if (jsonMode) {
    onDone(JSON.stringify(companion, null, 2), { display: 'system' })
    return <Text>{JSON.stringify(companion, null, 2)}</Text>
  }

  onDone(undefined, { display: 'skip' })
  return renderCompanionCard(companion)
}

// Mute subcommand
function handleMute(onDone: LocalJSXCommandOnDone): React.ReactNode {
  const config = getGlobalConfig()

  if (!config.companion) {
    onDone("You don't have a companion yet! Use `/buddy hatch` to get one.", {
      display: 'system',
    })
    return <Text>No companion hatched yet.</Text>
  }

  if (config.companionMuted) {
    onDone('Companion is already muted.', { display: 'system' })
    return <Text>Companion is already muted.</Text>
  }

  saveGlobalConfig((current) => ({
    ...current,
    companionMuted: true,
  }))

  onDone('Companion muted. Use `/buddy unmute` to show reactions again.', {
    display: 'system',
  })

  return <Text color="warning">Companion muted. 🤫</Text>
}

// Unmute subcommand
function handleUnmute(onDone: LocalJSXCommandOnDone): React.ReactNode {
  const config = getGlobalConfig()

  if (!config.companion) {
    onDone("You don't have a companion yet! Use `/buddy hatch` to get one.", {
      display: 'system',
    })
    return <Text>No companion hatched yet.</Text>
  }

  if (!config.companionMuted) {
    onDone('Companion is not muted.', { display: 'system' })
    return <Text>Companion is not muted.</Text>
  }

  saveGlobalConfig((current) => ({
    ...current,
    companionMuted: undefined,
  }))

  onDone('Companion unmuted! Your companion will now show reactions.', {
    display: 'system',
  })

  return <Text color="success">Companion unmuted! 💬</Text>
}

// Help subcommand
function handleHelp(onDone: LocalJSXCommandOnDone): React.ReactNode {
  onDone(undefined, { display: 'skip' })

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box marginBottom={1}>
        <Text bold color="success">
          /buddy — AI Companion Commands
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Available Commands:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Box>
            <Text bold color="warning">
              /buddy hatch [--seed {'<seed>'}]
            </Text>
            <Text dimColor> — Hatch a new companion</Text>
          </Box>
          <Box>
            <Text bold color="warning">
              /buddy pet
            </Text>
            <Text dimColor> — Pet your companion</Text>
          </Box>
          <Box>
            <Text bold color="warning">
              /buddy card [--json]
            </Text>
            <Text dimColor> — Show companion card</Text>
          </Box>
          <Box>
            <Text bold color="warning">
              /buddy mute
            </Text>
            <Text dimColor> — Mute companion reactions</Text>
          </Box>
          <Box>
            <Text bold color="warning">
              /buddy unmute
            </Text>
            <Text dimColor> — Unmute companion reactions</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text dimColor italic>
          Your companion is a unique AI pet determined by your account ID.
          {' '}
          Each person gets exactly one companion —_species, rarity, and stats are
          {' '}
          deterministic and cannot be changed!
        </Text>
      </Box>
    </Box>
  )
}

// Main command component
function BuddyCommand({
  onDone,
  context,
  args,
}: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  args: string
}): React.ReactNode {
  const { subcommand, args: subArgs } = React.useMemo(() => parseArgs(args), [args])
  const [result, setResult] = React.useState<React.ReactNode>(null)

  React.useEffect(() => {
    async function execute() {
      switch (subcommand) {
        case 'hatch':
          setResult(await handleHatch(subArgs, context, onDone))
          break
        case 'pet':
          setResult(handlePet(context, onDone))
          break
        case 'card':
          setResult(handleCard(subArgs, onDone))
          break
        case 'mute':
          setResult(handleMute(onDone))
          break
        case 'unmute':
          setResult(handleUnmute(onDone))
          break
        case 'help':
        default:
          setResult(handleHelp(onDone))
          break
      }
    }

    execute()
  }, [subcommand, subArgs, context, onDone])

  // Show card if no subcommand
  if (!subcommand || subcommand === '') {
    const companion = getCompanion()
    if (companion) {
      return renderCompanionCard(companion)
    }
    return handleHelp(onDone)
  }

  return result ?? <Text>Loading...</Text>
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  return <BuddyCommand onDone={onDone} context={context} args={args} />
}
