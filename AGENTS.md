# Project Guidelines

## Language

- Write all source code, identifiers, documentation, commit messages, logs, and user-facing API messages in English.
- Use Brazilian Portuguese only when communicating with the project owner outside the codebase.

## TypeScript and JavaScript

- Prefer TypeScript for application code. Enable strict compiler options and avoid `any`.
- Follow the standard TypeScript and JavaScript conventions: descriptive names, small focused functions, explicit types at module boundaries, and consistent formatting enforced by tooling.
- Prefer `async`/`await` over promise chains.
- Validate untrusted input at system boundaries, including HTTP and WebSocket payloads.
- Keep dependencies purposeful. Prefer platform capabilities and existing project dependencies when they solve the problem clearly.

## Simplicity and Architecture

- Start with the smallest implementation that meets the current requirement.
- Do not introduce abstractions, services, queues, caches, feature flags, or infrastructure for hypothetical future needs.
- Keep clear module boundaries even in a modular monolith. Do not split into separate deployable services without a demonstrated need.
- Before completing each increment, verify that the change preserves the current architecture and these guidelines. Simplify or revise the design when it does not.
- Preserve backward compatibility for existing API and WebSocket contracts unless the task explicitly authorizes a breaking change.

## Code Comments

- Prefer clear code over comments.
- Add comments only to document non-obvious constraints, decisions, or external behavior that code alone cannot express.
- Keep comments brief and in English.

## Tests and Verification

- Add focused tests for meaningful behavior, boundary conditions, and regressions introduced by a change.
- Favor high-signal tests over broad or redundant coverage.
- Do not add tests for trivial implementation details or framework behavior.
- Keep backend integration tests in `test/`, because they exercise application, database, HTTP, or WebSocket contracts.
- Keep frontend unit tests next to the code they cover in `apps/web/src/**/*.test.ts`.
- Keep future browser end-to-end tests in `apps/web/e2e/`.
- Run the relevant formatter, type checker, linter, and targeted tests after each increment when they exist.
- For every increment that exposes HTTP or WebSocket behavior, run an end-to-end QA check over TCP against the running server in addition to automated tests.
- Report verification performed and any checks that could not be run.

## Autonomy Modes

The default is Interactive Mode. Use Autonomous Mode only when an open GitHub
issue is explicitly labeled `agent-ready`.

### Interactive Mode

Use this mode when the project owner requests discussion, planning, learning,
architecture exploration, or step-by-step implementation.

1. Read the issue and inspect the relevant architecture and code.
2. Present an implementation plan.
3. Wait for owner approval before modifying code.
4. Implement the approved plan.
5. Run focused tests, relevant project checks, and required TCP or browser QA.
6. Commit the change and open a pull request.
7. Request an independent code review from another agent.
8. Apply actionable findings, rerun affected verification, and report the result.
9. Never merge without owner approval.

### Autonomous Mode

An issue labeled `agent-ready` authorizes one autonomous implementation.

1. Read the complete issue, acceptance criteria, labels, and linked context.
2. Inspect the relevant architecture and code.
3. Create a concise implementation plan and record it in the pull request.
4. Implement only the issue scope.
5. Run relevant tests, checks, and required QA.
6. Commit on a dedicated branch and open a pull request referencing the issue.
7. Request an independent code review from another agent.
8. Apply actionable findings that remain within the issue scope.
9. Rerun affected verification and leave the pull request ready for human review.
10. Never merge, close an issue, modify deployment configuration, or release autonomously.

## Autonomous Stop Conditions

Stop autonomous work and request owner input when:

- Acceptance criteria are ambiguous, incomplete, or contradictory.
- A breaking API, database, or WebSocket contract change is required.
- A new external dependency, paid service, or infrastructure component is required.
- A database migration is destructive, irreversible, or changes production data.
- Authentication, authorization, secrets, permissions, or other security boundaries need design changes.
- The work materially exceeds the issue scope.
- Existing checks reveal an unrelated regression.
- Independent review identifies an architectural concern rather than a localized fix.
- The issue is no longer open or no longer labeled `agent-ready`.

## Autonomous Scope Control

- The issue acceptance criteria are the authorization boundary.
- Do not perform unrelated refactors or cleanup.
- Do not create follow-up issues unless explicitly authorized.
- Record useful out-of-scope observations in the pull request instead of implementing them.
- If multiple `agent-ready` issues exist, select only the highest-priority one.
- If priority is unclear, stop and request owner input.
