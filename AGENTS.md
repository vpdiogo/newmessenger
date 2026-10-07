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

## Development Workflow

For each issue, follow this sequence:

1. Read the issue and inspect the relevant architecture and existing code.
2. Present an implementation plan before making changes.
3. Implement the smallest change that satisfies the issue and these guidelines.
4. Run focused tests, relevant project checks, and required TCP or browser QA.
5. Commit the change and open a pull request.
6. Request an independent code review from another agent.
7. Apply actionable review findings, then rerun the affected tests, project checks, and required QA.
8. Report the review outcome and final verification before recommending merge.
