-- Real learner, candidate, marks and report processing must remain fail-closed
-- until the responsible controller/privacy owner approves all documented gates.
-- This is a production control state change, not evidence of legal approval.
update private.environment_controls
set is_enabled = false,
    updated_at = now(),
    updated_by = current_user
where control_name = 'child_data_processing_enabled';
