# BUDDY 功能实现方案

> 编译开关：`feature('BUDDY')`
> 目标上线时间：2026 年 4 月
> 当前状态：核心代码已完整，仅缺少命令入口

---

## 一、功能概述

BUDDY 是一个终端内的虚拟宠物伴侣系统（类似拓麻歌子），为 Claude Code 添加趣味性和陪伴感。

### 核心特性

| 特性 | 描述 |
|------|------|
| **18 种物种** | 鸭、鹅、猫、龙、章鱼等 ASCII 精灵动画 |
| **5 级稀有度** | Common (60%) → Legendary (1%) |
| **闪光系统** | 1% 概率闪光个体 |
| **五维属性** | DEBUGGING / PATIENCE / CHAOS / WISDOM / SNARK |
| **即时交互** | 抚摸、气泡对话、表情反应 |
| **AI 集成** | 向 Claude 上下文注入宠物信息 |

---

## 二、现有代码分析

### 已完成的模块

| 文件 | 职责 | 完成度 |
|------|------|--------|
| `src/buddy/types.ts` | 类型、物种/稀有度/眼睛/帽子常量 | ✅ 100% |
| `src/buddy/companion.ts` | 生成逻辑、PRNG、属性计算 | ✅ 100% |
| `src/buddy/sprites.ts` | 18 种物种的 ASCII 精灵图 | ✅ 100% |
| `src/buddy/CompanionSprite.tsx` | React 组件、动画、气泡渲染 | ✅ 100% |
| `src/buddy/prompt.ts` | AI 上下文注入 | ✅ 100% |
| `src/buddy/useBuddyNotification.tsx` | 启动提示、输入高亮 | ✅ 100% |

### 缺失的部分

| 文件 | 职责 | 状态 |
|------|------|------|
| `src/commands/buddy/index.ts` | 命令注册入口 | ❌ 缺失 |
| `src/commands/buddy/buddy.tsx` | 主命令实现 | ❌ 缺失 |
| `src/commands/buddy/subcommands/` | 子命令实现 | ❌ 缺失 |

---

## 三、命令设计

### 主命令结构

```
/buddy                    # 显示帮助或宠物卡片
/buddy hatch             # 孵化新宠物（AI 生成名字和性格）
/buddy pet               # 抚摸宠物（爱心动画）
/buddy card              # 显示宠物卡片（精灵图 + 属性）
/buddy mute              # 静音宠物（隐藏气泡）
/buddy unmute            # 取消静音
```

### 子命令参数

| 命令 | 参数 | 说明 |
|------|------|------|
| hatch | `--seed <string>` | （可选）自定义种子用于测试 |
| pet | 无 | 触发 2.5 秒爱心动画 |
| card | `--json` | 以 JSON 格式输出宠物数据 |
| mute/unmute | 无 | 设置 config.companionMuted |

---

## 四、实现计划

### Phase 1: 命令入口（必须）

创建 `src/commands/buddy/index.ts`：

```typescript
import type { Command } from '../../commands.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Interact with your AI companion',
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
```

### Phase 2: 主命令实现（必须）

创建 `src/commands/buddy/buddy.tsx`，实现：

1. **帮助信息** - 显示所有可用子命令
2. **参数解析** - 解析子命令和参数
3. **子命令路由** - 分发到对应的处理函数

### Phase 3: 子命令实现（必须）

| 子命令 | 文件 | 功能 |
|--------|------|------|
| hatch | `subcommands/hatch.tsx` | 调用 AI 生成名字和性格 |
| pet | `subcommands/pet.tsx` | 触发爱心动画 |
| card | `subcommands/card.tsx` | 显示宠物信息卡片 |
| mute | `subcommands/mute.tsx` | 设置静音状态 |

### Phase 4: UI 组件（推荐）

创建 `src/components/BuddyCard.tsx` 用于展示宠物信息：

```
┌─────────────────────────────────────┐
│         ★★★★★ LEGENDARY             │
│                                     │
│        .----.                        │
│       ( ·  · )   ← Shiny Duck!      │
│      (  ._>  )                      │
│       `--´                          │
│                                     │
│  Name: Quackers                     │
│  Species: duck                      │
│  Personality: A chaotic genius...   │
│                                     │
│  DEBUGGING: ██████████ 95          │
│  PATIENCE:  ████████ 65            │
│  CHAOS:     ██████████ 98          │
│  WISDOM:    ██████ 50              │
│  SNARK:     ████████ 72            │
└─────────────────────────────────────┘
```

### Phase 5: 集成与测试

1. **修复 commands.ts** - 保持 `feature('BUDDY')` 条件加载
2. **集成到 AppState** - 确保 companionReaction 等状态可用
3. **测试孵化流程** - 端到端测试 AI 生成
4. **测试动画** - 验证精灵图和爱心动画

---

## 五、文件结构

```
src/
├── commands/
│   └── buddy/
│       ├── index.ts              ✅ 待创建
│       ├── buddy.tsx             ✅ 待创建
│       └── subcommands/
│           ├── hatch.tsx         ✅ 待创建
│           ├── pet.tsx           ✅ 待创建
│           ├── card.tsx          ✅ 待创建
│           └── mute.tsx          ✅ 待创建
├── components/
│   └── BuddyCard.tsx             ✅ 待创建（推荐）
├── buddy/
│   ├── companion.ts              ✅ 已存在
│   ├── types.ts                  ✅ 已存在
│   ├── sprites.ts                ✅ 已存在
│   ├── CompanionSprite.tsx       ✅ 已存在
│   ├── prompt.ts                 ✅ 已存在
│   └── useBuddyNotification.tsx  ✅ 已存在
```

---

## 六、关键实现细节

### 6.1 孵化命令 (hatch)

```typescript
// 伪代码流程
async function hatchCompanion(seed?: string) {
  // 1. 检查是否已有宠物
  if (existing) return error("Already have a companion")

  // 2. 生成宠物骨架（确定性的）
  const roll = seed ? rollWithSeed(seed) : roll(userId)

  // 3. 调用 AI 生成名字和性格
  const { name, personality } = await callClaudeForSoul(roll)

  // 4. 保存到配置
  config.companion = { name, personality, hatchedAt: Date.now() }
  saveConfig()

  // 5. 显示卡片
  return <BuddyCard companion={getCompanion()} />
}
```

### 6.2 AI 提示词模板

```typescript
const HATCH_PROMPT = `
Generate a name and short personality for a ${species} companion.

Rarity: ${rarity} (${stars})
Stats: DEBUGGING ${debugging}, PATIENCE ${patience}, CHAOS ${chaos}, WISDOM ${wisdom}, SNARK ${snark}

Respond ONLY with valid JSON:
{
  "name": "Short creative name (2-12 letters)",
  "personality": "One sentence personality (20-60 chars)"
}
`
```

### 6.3 抚摸命令 (pet)

```typescript
async function petCompanion() {
  // 设置 AppState 中的时间戳，触发动画
  setAppState({ companionPetAt: Date.now() })

  return {
    result: "You pet ${companion.name}!",
    display: "system"
  }
}
```

### 6.4 卡片命令 (card)

```typescript
function showCard(jsonMode = false) {
  const companion = getCompanion()

  if (jsonMode) {
    return JSON.stringify(companion, null, 2)
  }

  return <BuddyCard companion={companion} />
}
```

### 6.5 静音命令 (mute/unmute)

```typescript
function setMute(muted: boolean) {
  const config = getGlobalConfig()
  config.companionMuted = muted
  saveConfig()

  return `Companion ${muted ? 'muted' : 'unmuted'}`
}
```

---

## 七、配置持久化

### 配置结构

```typescript
// config.companion
interface StoredCompanion {
  name: string          // AI 生成的名字
  personality: string   // AI 生成的性格描述
  hatchedAt: number     // 孵化时间戳
}

// config.companionMuted
boolean                 // 是否静音气泡
```

### 读取/合并逻辑

```typescript
// companion.ts 已实现
export function getCompanion(): Companion | undefined {
  const stored = getGlobalConfig().companion
  if (!stored) return undefined

  // 骨架每次从 userId 重新计算（防作弊）
  const { bones } = roll(companionUserId())

  return { ...stored, ...bones }
}
```

---

## 八、与现有系统的集成

### 8.1 AppState 集成

需要在 `AppStateStore` 中确保以下状态可用：

```typescript
interface AppState {
  companionReaction?: string      // 气泡文字
  companionPetAt?: number         // 最后抚摸时间
  footerSelection?: string        // 当前选中的 footer 元素
}
```

### 8.2 REPL 集成

`src/entrypoints/cli.tsx` 或相关 REPL 文件需要：

1. 渲染 `<CompanionSprite />` 组件
2. 调用 `companionReservedColumns()` 计算宽度
3. 处理 `companionReaction` 状态

### 8.3 PromptInput 集成

输入框需要：

1. 计算可用宽度时减去宠物占用的列数
2. 显示宠物气泡（非全屏模式）
3. 处理 `/buddy` 关键字高亮（`useBuddyNotification.tsx` 已实现）

---

## 九、测试清单

### 功能测试

- [ ] `/buddy` 显示帮助信息
- [ ] `/buddy hatch` 成功孵化新宠物
- [ ] `/buddy hatch --seed test` 使用自定义种子
- [ ] `/buddy pet` 触发爱心动画
- [ ] `/buddy card` 显示宠物卡片
- [ ] `/buddy card --json` 输出 JSON
- [ ] `/buddy mute` 静音宠物
- [ ] `/buddy unmute` 取消静音

### 边缘情况

- [ ] 已有宠物时再次执行 hatch
- [ ] 未孵化时执行 pet/card/mute
- [ ] 终端宽度 < 100 列时的显示
- [ ] 全屏模式下的气泡位置
- [ ] AI 生成失败时的降级处理

### 视觉测试

- [ ] 18 种物种的精灵图正确渲染
- [ ] 5 级稀有度的颜色正确
- [ ] 闪光个体的特效
- [ ] 帽子正确显示
- [ ] 爱心动画流畅
- [ ] 气泡渐隐效果

---

## 十、部署步骤

### 1. 创建文件

```bash
# 创建目录
mkdir -p src/commands/buddy/subcommands

# 创建文件
touch src/commands/buddy/index.ts
touch src/commands/buddy/buddy.tsx
touch src/commands/buddy/subcommands/hatch.tsx
touch src/commands/buddy/subcommands/pet.tsx
touch src/commands/buddy/subcommands/card.tsx
touch src/commands/buddy/subcommands/mute.tsx
touch src/components/BuddyCard.tsx
```

### 2. 编译开关

保持 `src/commands.ts` 中的条件加载：

```typescript
const buddy = feature('BUDDY')
  ? require('./commands/buddy/index.js').default
  : null
```

### 3. 构建测试

```bash
# 启用 BUDDY 开关构建
BUDDY=1 bun run build

# 或直接开发模式运行
bun run dev
```

### 4. 启动测试

```bash
# 启动 Claude Code
bun run dev

# 测试命令
/buddy
/buddy hatch
/buddy pet
/buddy card
```

---

## 十一、后续扩展

### 可能的增强功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| **进化系统** | 使用时长增加属性或改变外观 | 低 |
| **互动玩具** | 玩具、食物等道具 | 低 |
| **多宠物** | 支持同时拥有多个宠物 | 低 |
| **宠物交换** | 与其他用户交换宠物 | 极低 |
| **皮肤系统** | 特殊节日皮肤 | 极低 |

---

## 十二、参考文档

- [01-buddy.md](./01-buddy.md) - BUDDY 功能详细说明
- [07-feature-gates.md](./07-feature-gates.md) - 编译开关和门控机制
- `src/buddy/` - 现有核心代码
- `src/commands/skills/` - 类似命令的实现参考

---

> 文档创建时间：2026-03-31
> 状态：待实现
> 预计工作量：4-6 小时
