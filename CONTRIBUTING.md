# Contributing to Calem

Thank you for contributing! We welcome community contributions.

## Development Workflow

1. Fork the repo and create a branch (`feature/<name>` or `fix/<name>`).
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev` (or `npm run dev:fast`)
4. Run tests: `npm run test` (E2E: `npm run test:e2e`)
5. Type check and build: `npm run build`

## Guidelines

- **Write tests for new logic**: All core additions must include unit or E2E tests.
- **Maintain performance**: Calem is local-first and performance-critical; avoid regressions.
- **PR Checklist**:
  - [ ] `npm run test` passes without errors
  - [ ] `npm run build` succeeds (type-check + bundle)
  - [ ] Clean, descriptive git commit messages

## Licensing & Agreements

All contributions are accepted under the **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**.
By contributing, you agree that your work will be licensed under AGPL-3.0. Contributors may later be asked to sign a Contributor License Agreement (CLA) or Developer Certificate of Origin (DCO) sign-off.
