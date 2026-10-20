-- Keep lifecycle assumptions true even if a future code path bypasses the domain service.
CREATE TRIGGER IF NOT EXISTS handoffs_source_event_required_insert
BEFORE INSERT ON handoffs
WHEN NEW.source_event_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'handoffs require a source event');
END;

CREATE TRIGGER IF NOT EXISTS handoffs_source_event_immutable
BEFORE UPDATE OF source_event_id ON handoffs
WHEN NEW.source_event_id IS NOT OLD.source_event_id
BEGIN
  SELECT RAISE(ABORT, 'handoff source events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS handoffs_state_invariants_insert
BEFORE INSERT ON handoffs
WHEN
  (NEW.status = 'new' AND NEW.owner_id IS NOT NULL)
  OR (NEW.status <> 'new' AND NEW.owner_id IS NULL)
  OR (NEW.status IN ('acknowledged', 'resolved') AND NEW.acknowledged_at IS NULL)
  OR (NEW.status IN ('new', 'assigned', 'reopened') AND NEW.acknowledged_at IS NOT NULL)
  OR (NEW.status = 'resolved' AND (NEW.resolution_note IS NULL OR trim(NEW.resolution_note) = ''))
  OR (NEW.status <> 'resolved' AND NEW.resolution_note IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'handoff status fields are inconsistent');
END;

CREATE TRIGGER IF NOT EXISTS handoffs_state_invariants_update
BEFORE UPDATE OF status, owner_id, acknowledged_at, resolution_note ON handoffs
WHEN
  (NEW.status = 'new' AND NEW.owner_id IS NOT NULL)
  OR (NEW.status <> 'new' AND NEW.owner_id IS NULL)
  OR (NEW.status IN ('acknowledged', 'resolved') AND NEW.acknowledged_at IS NULL)
  OR (NEW.status IN ('new', 'assigned', 'reopened') AND NEW.acknowledged_at IS NOT NULL)
  OR (NEW.status = 'resolved' AND (NEW.resolution_note IS NULL OR trim(NEW.resolution_note) = ''))
  OR (NEW.status <> 'resolved' AND NEW.resolution_note IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'handoff status fields are inconsistent');
END;
