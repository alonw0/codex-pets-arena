# Codex Pet Arena Tasks

## Completed

- [x] Persist progression after real matches
- [x] Use saved pet moves in real Supabase battles
- [x] Load user profile and uploaded pets from Supabase
- [x] Let user select active pet before matchmaking
- [x] Show generated pet moves in dashboard roster
- [x] Move pet creation to server API
- [x] Task 2: Server-authoritative battles
  - [x] Move submission API
  - [x] Turn resolution on the server
  - [x] Store each turn in `battle_turns`
  - [x] Store event playback in `battle_events`
  - [x] Prevent duplicate or late turn submissions
- [x] Alternating turn battle flow
  - [x] Add `activeSide` to battle state
  - [x] Resolve one submitted action immediately
  - [x] Reject actions from the inactive player
  - [x] Subscribe battle UI to `battles` and `battle_events`
  - [x] Add polling/focus fallback for missed Realtime events
- [x] Battle lifecycle cleanup
  - [x] Random matchmaking abandons the user's previous active battle before queueing
  - [x] Stale active battles are marked abandoned before active battle checks
  - [x] Battle room has a `Leave fight` button that closes the match regardless of turn
- [x] Battle balance pass
  - [x] New pets start at level 1
  - [x] New pet HP lands around 42-50
  - [x] Basic damage lands around 5-15
  - [x] Basic fights finish in about 6-7 actions
  - [x] Legacy high-HP pets and high-power moves are normalized at battle load
- [x] NPC Masters mode
  - [x] Add curated master definitions
  - [x] Add master challenge API
  - [x] Auto-resolve NPC turns
  - [x] Grant reduced training XP
  - [x] Count master battles in trainer wins/losses while keeping PvP badges separate
  - [x] Add dashboard master challenge UI

## In Progress

- [ ] Task 1: Real multiplayer flow
  - [x] Random queue pairing
  - [x] Friend-code lobby persistence
  - [x] Waiting/ready states
  - [x] Basic reconnect restoration
  - [x] Rematch flow

## Backlog

- [x] Gamification: Win/lose result panel
  - [x] Replace plain match-end text with a dedicated result panel
  - [x] Show winner/loser state clearly
  - [x] Show winner pet sprite in `waving` animation
  - [x] Show XP gained
  - [x] Show level-up state when applicable
  - [x] Add actions: `Back to dashboard`, `Rematch`, `Share result`
- [x] Gamification: Confetti on win
  - [x] Trigger short pixel/confetti animation only for the winning player
  - [x] Keep animation lightweight and non-blocking
  - [x] Disable/reduce animation when user prefers reduced motion
- [x] Gamification: XP and level-up animation
  - [x] Animate XP bar fill after match completion
  - [x] Show `LEVEL UP!` when the pet levels up
  - [x] Show stat gains such as HP, attack, defense, special, and speed
  - [x] Persist and display the final level/XP cleanly after animation
- [x] Gamification: Badges
  - [x] Add badge data model and RLS/server-write policy
  - [x] Award first badge set: First Upload, First Win, Hot Streak, Comeback, Collector, Rivalry, Veteran
  - [x] Show earned badges on dashboard/profile
  - [x] Show newly earned badges on match result panel
- [x] Gamification: Dashboard pet battle cards
  - [x] Upgrade roster rows into richer pet cards
  - [x] Show level badge, XP progress, affinity, record, and generated moves
  - [x] Highlight selected active pet more clearly
  - [x] Show badge/title slots on each pet card
- [x] Gamification: Match intro and result recap
  - [x] Add pre-fight intro: challenger text, sprite entrance, and short countdown
  - [x] Add post-fight recap: turns, damage dealt, biggest hit, most-used move, XP earned
  - [x] Keep recap readable on mobile
- [ ] Optionally use saved/generated moves in `/battle/demo`
- [ ] Production auth polish
- [ ] Mobile and visual QA pass
- [ ] Deployment setup and production smoke test
