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
- Run the relevant formatter, type checker, linter, and targeted tests after each increment when they exist.
- Report verification performed and any checks that could not be run.
