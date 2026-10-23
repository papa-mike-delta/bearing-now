# bearing.now

Personal life OS and interconnected digital brain. The Coach has the same access to the information as the user.

## Language

**Item**:
The atomic unit of the digital brain. Everything the user captures (tasks, notes, people, events, bookmarks, goals, routines, etc.) is an Item of a given type.
_Avoid_: Entry, record, node, entity

**Link**:
A directed, typed relationship between two Items.
_Avoid_: Edge, connection, relation, association

**Goal**:
An Item that acts as an overarching connector for Tasks. Tasks advance a Goal.
_Avoid_: Objective, target, aim

**Routine**:
An Item that acts as an overarching connector for Habits. Habits track a Routine.
_Avoid_: Schedule, sequence, plan

**Person**:
An Item representing a human the user has a relationship with. Has a relationship tier.
_Avoid_: Contact, friend, acquaintance

**Relationship tier**:
One of eight ordered categories describing closeness: Family, Extended family, Intimate friends, Close friends, Casual friends, Acquaintances, Business Contacts, Almost strangers.

**Bookmark**:
An Item that points at external content. Can be a URL, a location, or a file. Location bookmarks carry place metadata the same way media bookmarks carry medium/author metadata.
_Avoid_: Link, reference, resource

**Note summary**:
A short, skim-friendly text field on a Note. If the user saves a Note without one, the Coach writes it.

**Coach**:
The full agent that lives inside the app (same session, same domain functions) and has the same access to the digital brain as the user, subject to write caps, revision checks, and operation ledgers.
The full agent that has the same access to the digital brain as the user, subject to write caps, revision checks, and operation ledgers.
_Avoid_: Assistant, bot, AI

**Operation ledger**:
The durable record of every mutation (create, update, link) performed by the user or the Coach. Provides idempotency and an audit trail.
_Avoid_: Log, audit trail, history

**Revision**:
The optimistic concurrency token on an Item. Updates must present the current revision or be rejected as a conflict.
_Avoid_: Version, etag, timestamp
