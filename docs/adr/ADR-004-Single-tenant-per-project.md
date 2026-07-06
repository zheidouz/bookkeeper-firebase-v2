# ADR-004. Single-tenant per Firebase project

**Status:** Accepted
**Date:** 2026-07-06
**Project:** bookkeeper-firebase-v2

## Context

This is an internal bookkeeper firm's tool — one organization, one user pool, one data namespace. Firebase supports two multi-tenancy shapes: a single project with a `firmId` field on every document (cheap operationally, expensive in security rules and indexes), or one Firebase project per firm (expensive to provision, simple rules, isolated quotas). For an internal tool used by a single firm today, neither multi-tenancy primitive is justified — and yet the choice is sticky because adding `firmId` later requires a backfill migration.

## Decision

One Firebase project, no `firmId`. Every document belongs to the firm that owns the project. Security rules assume `request.auth.token.role` is the only RBAC dimension. If a future customer requires their own data isolation, we provision a separate Firebase project per customer; we do not retrofit `firmId` into the existing project.

## Consequences

- Security rules stay simple: `role`, `assignedBookkeeperId`, and ownership are the only filters.
- No composite index ever needs `firmId` as a leading field; the index plan stays small.
- Quota (Firestore reads/writes, Cloud Function invocations, Cloud Storage GB) is shared across all users; acceptable for a firm-sized user pool.
- A future pivot to SaaS multi-tenancy requires provisioning one Firebase project per customer and a thin onboarding shell — not a data migration.
- Disaster-recovery and backups are scoped to one project; restores are all-or-nothing for the firm.

## Follow-up

Document the migration playbook (one paragraph in the deploy notes) so a future operator knows: "to onboard a new customer, create a new Firebase project and clone the codebase, do not add `firmId`."