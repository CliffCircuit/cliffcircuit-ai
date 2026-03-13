# Portal Agents Page — Model Editing UX + Backend Alignment

## Objective
Implement a clean, low-clutter editing flow on the Portal Agents page so each agent card supports both:

1. **Current model** editing = temporary session override
2. **Default model** editing = persistent per-agent default

The page must stay visually simple in its default state. Editing controls should only appear when explicitly requested by the user.

## Product Intent
The current page is directionally good, but it blurs together three different concepts:
- current session model
- agent default model
- cron model

This project should clarify the behavior **without bloating the UI**.

## Design Principles
- Keep agent cards clean and mostly read-only by default
- No always-visible pencil clutter
- One clear edit entry point per card
- Minimal copy on-screen
- Behavior must match OpenClaw reality
- Do not imply functionality that does not exist
- No frameworks; preserve current portal style and architecture

## Ground Truth / Functional Rules

### Current model
- Represents the model the agent is running **right now**
- This is a **temporary session override**
- It resets when the relevant session ends or is recreated
- "Use default" should clear the current session override

### Default model
- Represents the agent's **persistent configured default**
- Stored via OpenClaw per-agent config semantics (`agents.list[].model`)
- Persists across future sessions and restarts
- If unset, it should inherit the global default

### Global default
- Exists separately from agent card editing
- Not the primary focus of this task
- Agents page should support agent-level default editing, not turn into a global settings page

### Cron model
- Separate concept
- Do not conflate cron model editing with card-level current/default model editing
- Existing cron model controls should remain separate

## Required UX Contract

### Default card state
Each agent card shows, in read-only form:
- Current model
- Default model
- Optional small override badge if current != default

Do **not** show inline edit pencils in the default state.

### Edit entry point
Each agent card gets a **single small edit icon in the top-right corner**.

Clicking this icon puts only that card into **edit mode**.

### Edit mode
When a card enters edit mode:
- Current model display becomes a dropdown/select
- Default model display becomes a dropdown/select
- Show `Apply` and `Cancel`
- Keep layout compact; do not turn the card into a large form
- Only one card should be in edit mode at a time

### Labels
Use minimal labels:
- `Current`
- `Default`
- `Apply`
- `Cancel`
- `Use default` for clearing current session override
- `Inherit global` for clearing agent default, if supported by implementation

### Save behavior
Use **one Apply button per card**.

When Apply is clicked:
- If Current changed, apply temporary session override change
- If Default changed, apply persistent per-agent default change
- If both changed, apply both
- If neither changed, no-op gracefully
- Return card to read-only state after success

### Cancel behavior
- Discard unsaved card changes
- Return card to read-only state

## Technical Requirements

### Current model backend behavior
Replace or refine the existing current-model flow so it correctly handles:
- set session override
- clear session override (`Use default`)
- no misleading persistence claims

If the current localhost flow remains temporarily necessary, it must still correctly reflect session-only semantics.

### Default model backend behavior
Implement persistent per-agent default editing using the correct OpenClaw model:
- per-agent config path corresponds to `agents.list[].model`
- should support either explicit model value or inherited/global behavior

Do not fake this as a slash command if it is actually a config write.

### Browser/network architecture
Current portal → localhost architecture is known to be brittle due to browser private network restrictions.

As part of this project:
- preserve functionality as much as practical
- avoid deepening reliance on brittle patterns
- if a better server-side path already exists or can be introduced cleanly, prefer it
- if full architecture cleanup is out of scope, at minimum make the card UX and backend semantics correct

## Constraints
- Preserve current visual style of portal
- No UI bloat
- No emojis
- No framework migration
- Do not rewrite the whole page
- Minimize collateral changes
- Keep cron editing behavior separate
- Treat this as a surgical update to the existing agents page, not a page redesign

## Likely Files In Scope
Primary target files are expected to include only what is necessary for this task, most likely:
- `portal/agents.html`
- `portal/portal-common.js`
- any existing local helper/service file already responsible for model override or config mutation

Avoid broad changes outside these areas unless required to make the feature actually work.

## Execution Boundaries
- Work in the existing portal repo only
- Do not redesign unrelated cards, tabs, or navigation
- Do not change crons UX except where needed to avoid regression
- Do not introduce a new frontend framework or a new design system
- Prefer extending existing helpers/services over creating parallel systems unless the current path is fundamentally broken

## Acceptance Criteria
- [ ] Agent cards are clean by default with no always-visible inline pencils
- [ ] Each card has one top-right edit icon
- [ ] Clicking edit reveals compact edit controls for Current and Default only on that card
- [ ] Current model edits behave as session-only overrides
- [ ] Current model supports clearing override via `Use default`
- [ ] Default model edits persist as per-agent defaults
- [ ] Default model can inherit global behavior if unset
- [ ] Apply/Cancel work cleanly
- [ ] Only one card can be in edit mode at a time
- [ ] Existing cron model controls remain separate and intact
- [ ] UI copy stays minimal and non-noisy
- [ ] Behavior shown in UI matches actual backend semantics

### Phase 1: UX Contract + Card Edit Mode
- [ ] Remove always-visible model edit pencils from default card state
- [ ] Add one edit icon to top-right of each agent card
- [ ] Implement single-card edit mode state
- [ ] Swap read-only Current/Default rows into compact editable controls when edit mode is active
- [ ] Add Apply and Cancel actions
- [ ] Ensure only one card can be editing at a time

### Phase 2: Current Model Semantics
- [ ] Audit current-model change flow on agents page
- [ ] Make current-model behavior explicitly session-only
- [ ] Implement `Use default` so it actually clears the session override
- [ ] Ensure displayed Current value reflects actual live/session behavior
- [ ] Preserve override badge semantics when current != default

### Phase 3: Default Model Persistence
- [ ] Implement per-agent persistent default editing aligned with OpenClaw `agents.list[].model`
- [ ] Support explicit model selection for agent default
- [ ] Support inherited/global behavior when agent default is unset
- [ ] Ensure UI label/value logic correctly distinguishes Current vs Default vs inherited global
- [ ] Avoid implying a first-class per-agent CLI command if backend uses config mutation

### Phase 4: Polish, Validation, and Safety
- [ ] Verify card UX stays compact and visually clean
- [ ] Verify Apply/Cancel state transitions feel smooth
- [ ] Verify no regressions to cron model controls
- [ ] Verify one-card-at-a-time editing works reliably
- [ ] Verify behavior matches actual OpenClaw semantics, not assumptions
- [ ] Document any remaining backend limitation clearly in code comments or follow-up notes

## Notes for Implementer
- Favor small, surgical changes over large rewrites
- Preserve existing shared helpers where practical
- If backend support for default-model mutation is incomplete, implement the UI truthfully rather than pretending a simpler backend exists
- If architectural cleanup is needed but too large for this pass, isolate it and keep this task focused on getting the semantics and UX right
