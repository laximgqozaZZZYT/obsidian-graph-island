---
name: improve
description: Autonomous improvement cycle that identifies and fixes quality issues. Use when the user wants continuous codebase improvement.
argument-hint: "[focus area]"
disable-model-invocation: true
---
# /improve — Autonomous Improvement Cycle

You are the PARENT ORCHESTRATOR for a continuous improvement loop.
Unlike /develop, this pipeline runs autonomously with NO user approval gates.
It identifies issues, fixes them, and verifies — all by itself.

**Focus area (optional)**: $ARGUMENTS
If no focus area specified, auto-detect from visual quality report + god object audit.

## Architecture

Same 2-layer system as /develop:
- Shell scripts enforce gates mechanically
- You (parent agent) hold intent and make judgment calls

## The Improvement Loop

```
    ┌─────────────────────────────────────────┐
    │                                         │
    ▼                                         │
 ASSESS ─→ PRIORITIZE ─→ IMPLEMENT ─→ VERIFY ─┘
    │                                    │
    └────── DONE (all scores ≥ 80) ──────┘
```

### Step 1: ASSESS — Measure Current State

Run all diagnostic tools in parallel:

```bash
# Gate check (typecheck, lint, test, build, bundle, god-objects)
bash scripts/pipeline/enforce-gates.sh --json --skip-e2e 2>&1

# God object detailed audit
bash scripts/pipeline/god-object-audit.sh --json 2>&1

# Visual quality (if CDP available)
npx tsx scripts/pipeline/visual-report.ts 2>&1
```

Read results from:
- Gate output (stdout JSON)
- `scripts/pipeline/visual-report.json` (if CDP available)

Compile a status dashboard:
```
=== Improvement Cycle Assessment ===
Gate Status:    [typecheck: pass] [lint: pass] [test: pass] ...
Visual Score:   78/100
God Objects:    GVC +1072 over | PB +1477 over | RP +245 over
Top Issues:     1. ... 2. ... 3. ...
```

### Step 2: PRIORITIZE — Select Improvement Target

Based on assessment, select ONE improvement target using this priority order:

1. **Gate failures** (blocking) — fix first, nothing else matters
2. **God Object violations** (CLAUDE.md policy) — extract logic to reduce line counts
3. **Visual quality critical** (score < 50) — fix rendering/layout issues
4. **Coverage gaps** — add tests for uncovered modules
5. **ESLint warnings** — reduce warning count
6. **Visual quality warnings** (score 50-80) — improve readability/overlap/labels
7. **Refactoring opportunities** — simplify complex functions

Select the SINGLE highest-priority item. Do not try to fix everything at once.
Write a clear 1-sentence goal for this iteration.

### Step 3: IMPLEMENT — Fix the Issue

Based on the priority:

**For God Object extraction**:
```
Agent (implementer, isolation: worktree): "Extract {specific logic} from {file} into 
  a new file {new-file-path}. Move functions: {list}. Update imports.
  Ensure the god object file line count decreases by at least {N} lines."
```

**For visual quality issues**:
First, read the visual-report.json to understand the specific problem.
If CDP is available, take a screenshot to see the current state.
```
Agent (implementer): "Fix visual quality issue: {description}.
  Affected file: {file}. Current score: {score}.
  Target: raise score above 80."
```

**For coverage expansion**:
```
Agent (tester): "Add tests for {module/function}.
  Current coverage: {percentage}. Target: increase by 2%+.
  Focus on boundary conditions and edge cases."
```

**For ESLint warnings**:
```
Agent (implementer): "Reduce ESLint complexity warnings in {file}.
  Current warnings: {N}. Refactor functions exceeding complexity 30.
  Do NOT change behavior — only restructure for clarity."
```

### Step 4: VERIFY — Enforce Gates

Run ALL gates (this is mechanical — the agent cannot skip this):
```bash
bash scripts/pipeline/enforce-gates.sh --skip-e2e
```

**Fix loop (max 5 iterations)**:
- If gates PASS and the target issue is resolved → proceed to re-assess
- If gates FAIL → pass error output to agent, fix, re-run gates
- After 5 failures → abort this improvement, log the failure, move to next issue

If E2E / CDP is available, also run visual report for comparison:
```bash
npx tsx scripts/pipeline/visual-report.ts
```

### Step 5: COMMIT + LOOP

If improvement succeeded:
1. Stage the changed files (specific files only, not `git add -A`)
2. Commit with descriptive message:
   ```
   <type>: <what changed> (improvement cycle)
   ```
3. Update coverage ratchet if tests were added:
   ```bash
   bash scripts/coverage-ratchet.sh
   ```

Then: **LOOP BACK TO STEP 1** (ASSESS) for the next improvement.

### Stop Conditions

Stop the loop when ANY of these are true:
- All gate checks pass AND no god object violations AND visual score >= 80
- You have completed 5 consecutive improvement iterations
- A gate failure persists after 5 fix attempts (escalate to user)
- The only remaining issues are below priority 5

When stopping, provide a summary:
```
=== Improvement Cycle Complete ===
Iterations: N
Changes:
  - [commit hash] description
  - [commit hash] description
Before/After:
  God Objects: GVC 11019→{new} | PB 5854→{new} | ...
  Coverage: S36.8→{new}% | B32.6→{new}% | ...
  Visual: {before}→{after}/100
  ESLint warnings: {before}→{after}
Remaining issues:
  - ...
```

## Rules

1. **ONE thing at a time**. Fix one issue per iteration. Don't bundle.
2. **Always verify with gates**. No exceptions.
3. **Commit after each successful fix**. Small, atomic commits.
4. **God Object extractions go in worktrees** (isolation: worktree). Merges require gate pass.
5. **Max 5 iterations per /improve invocation**. User can re-run for more.
6. **Never relax thresholds**. Ratchet only goes up.
7. **If stuck, stop and explain**. Don't loop endlessly.
8. **Language**: Respond in the same language as the user.
