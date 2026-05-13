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

## In Progress

- [ ] Task 1: Real multiplayer flow
  - [x] Random queue pairing
  - [x] Friend-code lobby persistence
  - [x] Waiting/ready states
  - [x] Basic reconnect restoration
  - [ ] Rematch flow

## Backlog

- [ ] Optionally use saved/generated moves in `/battle/demo`
- [ ] Production auth polish
- [ ] Mobile and visual QA pass
- [ ] Deployment setup and production smoke test
