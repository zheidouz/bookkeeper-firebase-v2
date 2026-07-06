# ADR-002. Recurring task materialization: current only

**Status:** Accepted
**Date:** 2026-07-06
**Project:** bookkeeper-firebase-v2

## Context

A client with 5 active forms and a 5-year horizon has ~25 annual filings, or ~125 over a quarter-century. The naïve design pre-materializes every upcoming period as its own document. That bloats storage, forces pruning logic, and makes the "pending forms" dashboard count noisy (it would include tasks due years out). The opposite extreme — materializing nothing until the first archive — loses the dashboard's "what's outstanding right now" value.

## Decision

Materialize only the current task per (client, form, period). When a task is archived, `archiveTask` computes the next period from the form's `defaultFrequency` + the just-archived task's `periodEnd`, then writes a new task document with `previousTaskId` pointing back to its predecessor. There is no "future queue" in storage. The dashboard's "Pending forms" count equals the number of `clientFormTasks` documents where `status == 'pending'` — exact, not estimated.

## Consequences

- Storage is bounded by active clients × forms × 1, not × years.
- Dashboard counts are exact and trivially fast (a single `where('status','==','pending')` query).
- "What's coming up next quarter?" requires the calculator at query time, not a stored doc. We accept this because the dashboard cares about *now*, not next quarter.
- If a client is onboarded mid-year, we backfill the missing historical periods at attach-time only for forms whose deadline has already passed in the current year — past periods are not retroactively filed by default.
- A form whose frequency changes mid-stream requires manual intervention; we do not attempt to retroactively reschedule all descendants.

## Follow-up

If "next 90 days" becomes a frequently-asked view, add a `getUpcomingTasks({days})` callable that uses the calculator on the fly, rather than pre-materializing.