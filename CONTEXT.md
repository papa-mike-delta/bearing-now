# Current project context

Bearing V1 captures, organizes, connects and recalls personal information.
It builds on the existing Next.js/PostgreSQL application and domain protections.

Current entry points:
- [README](README.md): install, configuration and actual feature boundaries.
- [Approved V1 specification](docs/redesign/BEARING_V1_SPEC.md): product contract.
- [Architecture](docs/ARCHITECTURE.md): storage, auth, workflow, offline and Coach.
- [Release runbook](docs/RELEASE.md): scenario matrix, preview/production gates.
- [Contributing](CONTRIBUTING.md): development and verification expectations.

Seven Item kinds replace the legacy ontology; Areas are classified Tags. V1 routes
are feature gated. Both Prisma migration histories must be applied explicitly on
an isolated preview first. Nothing in the repository authorizes a production reset.
The old shared demo is retired for V1; optional examples are per-account Settings
actions. Coach uses server-side configured providers and approved write batches.

The historical ADRs and legacy components are useful implementation history. They
must not be interpreted as current user-facing capabilities. Follow the V1 contract
and update current documentation alongside changes.
