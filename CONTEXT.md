# Current project context

Bearing V1 captures, organizes, connects and recalls personal information.
It builds on the existing Next.js/PostgreSQL application and domain protections.

Current entry points:
- [README](README.md): install, configuration and actual feature boundaries.
- [Approved V1 specification](docs/redesign/BEARING_V1_SPEC.md): product contract.
- [Architecture](docs/ARCHITECTURE.md): storage, auth, workflow, offline and Coach.
- [Release runbook](docs/RELEASE.md): scenario matrix, preview/production gates.
- [Contributing](CONTRIBUTING.md): development and verification expectations.

Seven Item kinds are the V1 model; Areas are classified Tags. `/app` and `/api/v1`
are the product path. `src/lib/domain` and the legacy Coach tools are removed.
Pre-V1 content APIs return 410. `User`, `Setting` and `OperationLedger` stay shared.
Legacy content tables stay until a reviewed drop on or after 2027-01-26.
Nothing in the repository authorizes a production reset or an Item → V1Item
conversion. Both Prisma migration histories must be applied explicitly on an
isolated preview first. The old shared demo is retired; optional examples are
per-account Settings actions. Coach uses server-side configured providers and
approved write batches.

[ADR 0005](docs/adr/0005-sunset-legacy-domain-and-coach.md) is binding for new work.
ADR 0001, ADR 0002 and ADR 0004 are historical and must not be extended.
