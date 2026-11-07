-- Journal entries can record that a capture happened at a Place.
-- Existing mention and reference rows remain valid.
ALTER TABLE "V1MomentItem" DROP CONSTRAINT "V1MomentItem_relation";
ALTER TABLE "V1MomentItem" ADD CONSTRAINT "V1MomentItem_relation" CHECK ("relation" IN ('mention', 'reference', 'located_at'));
