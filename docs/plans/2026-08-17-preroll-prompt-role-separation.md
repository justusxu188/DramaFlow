# Preroll Prompt Role Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every AI preroll generation and conditional rewrite uses the configured System Prompt unchanged, while all project-specific context and correction instructions are sent through User Prompt.

**Architecture:** Replace the unconditional model review with local structural and similarity validation. The initial call and the optional corrective retry share one System Prompt builder; dynamic story evidence, style, duration, transition, history, candidates, and validation failures live in structured User Prompt payloads.

**Tech Stack:** TypeScript, Zod, Vitest, Doubao Ark chat completions

---

### Task 1: Add prompt-role and retry tests

**Files:**
- Modify: `src/lib/providers/providers.test.ts`
- Test: `src/lib/providers/providers.test.ts`

**Step 1: Write failing tests**

Add tests for exported preroll request helpers:

```ts
expect(messages[0]).toEqual({
  role: "system",
  content: configuredSystemPrompt,
});
expect(JSON.parse(messages[1].content)).toMatchObject({
  task: "generate_preroll_scripts",
  constraints: {
    scriptStyle: "spectacle",
  },
});
```

Add validation tests proving complete, novel scripts need no retry and incomplete or overly similar scripts produce a correction issue list.

**Step 2: Run tests to verify failure**

Run: `npm test -- src/lib/providers/providers.test.ts`

Expected: FAIL because the new helpers do not exist.

### Task 2: Separate System Prompt and User Prompt

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Test: `src/lib/providers/providers.test.ts`

**Step 1: Add runtime script validation**

Define a Zod schema for the required `ScriptDraft` fields and normalize duration only after parsing.

**Step 2: Build the initial User Prompt**

Move expression style, creative boundary, novelty rules, output schema, duration, story evidence, transition anchor, and historical scripts into one structured User Prompt payload.

Keep the System Prompt exactly equal to:

```ts
input.customSystemPrompt?.trim() ||
  "你是擅长短剧投流转化的前贴脚本编剧。"
```

**Step 3: Remove unconditional model review**

Return the initial candidates directly when they pass local structure, count, and similarity validation.

**Step 4: Add one conditional corrective retry**

When validation fails, call Ark once more with the same System Prompt. Put the original task context, candidates, and machine-detected issue list in the new User Prompt.

**Step 5: Run focused tests**

Run: `npm test -- src/lib/providers/providers.test.ts`

Expected: PASS.

### Task 3: Verify repository behavior

**Files:**
- Verify: `src/lib/providers/ark.ts`
- Verify: `src/lib/providers/providers.test.ts`

**Step 1: Run all automated tests**

Run: `npm test`

Expected: all tests pass.

**Step 2: Run TypeScript validation**

Run: `npm run typecheck`

Expected: no TypeScript errors.

**Step 3: Run production build**

Run: `npm run build`

Expected: Next.js production build succeeds.

No Git commit is created because this workspace is not a Git repository and the user did not request a commit.
