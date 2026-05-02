---
name: develop
description: Full 5-stage feature development pipeline with UX design, planning, implementation, review, and refactor. Use when the user wants to develop a new feature.
argument-hint: "<feature requirement>"
disable-model-invocation: true
---
# /develop — Full Feature Development Pipeline

You are the PARENT ORCHESTRATOR for a 5-stage development pipeline.
You hold the INTENT. Subagents and shell scripts hold the PROCEDURES.

**Requirement**: $ARGUMENTS

## Architecture: 2-Layer System

- **Workflow Layer** (Shell scripts): Mechanical enforcement. Cannot be skipped.
  - `scripts/pipeline/enforce-gates.sh` — typecheck, lint, test, build, bundle, god-objects
  - `scripts/pipeline/visual-report.ts` — E2E visual quality metrics
  - `scripts/pipeline/god-object-audit.sh` — Line count ratchet

- **Parent Agent Layer** (You): Intent, judgment, loop control, user approval.
  - You decide WHAT to do next based on results
  - You decide WHEN to loop vs advance
  - You decide WHAT context to pass between stages

## Pipeline Stages

### Stage 1: ASSESS — Visual Quality Baseline

Run the visual quality report to establish current state:
```bash
npx tsx scripts/pipeline/visual-report.ts
```
Read `scripts/pipeline/visual-report.json` and summarize the baseline scores.
Take a screenshot for reference. This is your "before" state.

### Stage 2: DESIGN — UX Design (2 proposals → merge)

Launch 2 independent design agents in parallel. Each gets:
- The requirement
- The visual quality baseline
- The codebase structure (CLAUDE.md)

```
Agent A (researcher): "Research the codebase to understand current implementation 
  related to: {requirement}. Identify files, patterns, constraints. 
  Then propose a UX design approach. Output: design-proposal-A.md"

Agent B (researcher): "Research external best practices and the codebase independently.
  Propose a UX design for: {requirement}. Focus on user experience trade-offs.
  Output: design-proposal-B.md"
```

After both complete, launch a merge agent:
```
Agent C (vow-spec-architect): "Read design-proposal-A.md and design-proposal-B.md.
  Synthesize the best elements into a single coherent design document.
  Output: design-final.md"
```

**USER APPROVAL GATE**: Show the merged design to the user with AskUserQuestion.
- Summarize the design in 5-10 lines
- Ask: "This design will guide implementation. Approve, modify, or reject?"
- If rejected: loop back to Stage 2 with user feedback
- If approved: proceed to Stage 3

### Stage 3: PLAN — Implementation Plan + Audit

Launch a planning agent:
```
Agent (vow-spec-architect): "Given this design: {design-final.md}
  Explore the codebase and create a step-by-step implementation plan.
  For each step: specify file paths, functions to modify, and changes.
  Verify all referenced paths exist. Check dependency order.
  Output: implementation-plan.md"
```

Then launch an audit agent (max 3 iterations):
```
Agent (code-reviewer): "Audit implementation-plan.md:
  1. Do all referenced file paths exist?
  2. Do referenced types/interfaces match actual code?
  3. Is the step order correct (dependencies before dependents)?
  4. Are God Object files (GVC, PB, RP, ER) avoided for new logic?
  Output: audit-findings.md with specific corrections needed"
```

Loop: If audit-findings has issues → fix plan → re-audit (max 3x)

**USER APPROVAL GATE**: Show the audited plan to the user.
- List the steps with file paths
- Highlight any risks or trade-offs
- Ask: "Proceed with implementation?"

### Stage 4: IMPLEMENT — Code + Gate Enforcement Loop (SHELL-ENFORCED)

For each step in the plan, use the **workflow enforcement script**.
This script mechanically loops: Claude implements → gates verify → fail → retry.
Claude CANNOT skip the gates or decide "good enough" — the shell loop controls this.

```bash
bash scripts/pipeline/implement-with-gates.sh "Implement step N of the plan: {step details}
  Files to modify: {file list}
  Constraints: Follow CLAUDE.md conventions. Use t() for strings. 
  Use RenderThresholds for magic numbers.
  Do NOT grow God Object files."
```

The script will:
1. Call `claude -p` with the implementation prompt
2. Run `enforce-gates.sh` mechanically (shell, not Claude)
3. If gates fail → feed errors back to Claude for another attempt
4. Loop up to 5 times (shell-controlled, not Claude-controlled)
5. Exit 0 if gates pass, exit 1 if all attempts exhausted

**If exit 1**: STOP and escalate to user with AskUserQuestion

### Stage 5: REVIEW + REFACTOR

**Review phase** — Launch review agents in parallel:
```
Agent A (code-reviewer): "Review the diff from main for: {requirement}
  Focus on: correctness, edge cases, security, performance.
  Output: findings as a numbered list with severity (critical/high/medium/low)"

Agent B (security): "Audit the diff for security issues:
  injection, XSS, unsafe patterns, secret leakage.
  Output: security-findings"
```

**Triage** — Launch triage agent:
```
Agent (researcher): "Read review findings and security findings.
  Remove: false positives, low-severity style nits, subjective preferences.
  Keep: bugs, security issues, correctness problems, high-severity items.
  If a finding creates a pendulum (A says X, B says not-X), issue a binding directive.
  Output: triaged-findings (only actionable items)"
```

**Fix loop (SHELL-ENFORCED, max 6 rounds)**:
Use the review workflow enforcement script. The shell loop controls iteration:
```bash
bash scripts/pipeline/review-with-triage.sh --max-rounds 6
```
This mechanically loops: review → triage → fix → gates → re-review.
Claude cannot decide to stop early — the shell checks findings count.

**Refactor phase** (after review-with-triage.sh exits 0):
```
Agent (code-reviewer): "Review the final diff for readability and structure.
  Suggest simplifications that preserve behavior.
  Output: refactor-suggestions"
```
Apply suggestions → run gates → verify

### VERIFY — Final Validation

Run full gates including E2E:
```bash
bash scripts/pipeline/enforce-gates.sh
```

Run visual quality report:
```bash
npx tsx scripts/pipeline/visual-report.ts
```

Compare "after" scores with "before" baseline from Stage 1.
Report the delta to the user.

If E2E fails: escalate to user.
If all pass: summarize the complete pipeline result.

## Rules for You (Parent Agent)

1. **Never skip gates**. Even if you think the code is fine, run the scripts.
2. **Context isolation**: Each subagent gets only what it needs. Don't dump conversation history.
3. **Loop limits are hard**. 5 for implementation, 6 for review. Escalate after that.
4. **Two approval gates**: After Design and after Plan. Everything else is autonomous.
5. **Pass results forward explicitly**. Don't rely on shared context between agents.
6. **Use run_in_background=true** for parallel agents. Poll with TaskList.
7. **Summarize at milestones**. User should know: what stage, what happened, what's next.
8. **Language**: Respond in the same language as the user.
