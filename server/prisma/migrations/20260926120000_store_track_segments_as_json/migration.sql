-- RII-3: store each track's points as one JSONB value on `tracks` instead of
-- one `track_points` row per point. See docs/SPEC.md §4 "Track geometry
-- storage" for the format and the reasoning.
--
-- Data-preserving: existing points are copied into `tracks.segments` before
-- `track_points` is dropped. Point format: [lat, lng, elevationM, recordedAtEpochMs]
-- with trailing nulls trimmed.

-- AddColumn (nullable until backfilled)
ALTER TABLE "tracks" ADD COLUMN "segments" JSONB;

-- Backfill: points -> segments (ordered by segment, then sequence)
UPDATE "tracks" AS t
SET "segments" = s."segments"
FROM (
    SELECT "track_id", jsonb_agg("points" ORDER BY "segment") AS "segments"
    FROM (
        SELECT "track_id", "segment", jsonb_agg("point" ORDER BY "sequence") AS "points"
        FROM (
            SELECT "track_id", "segment", "sequence",
                CASE
                    WHEN "recorded_at" IS NOT NULL THEN jsonb_build_array(
                        "lat", "lng", "elevation_m",
                        round(extract(epoch FROM "recorded_at") * 1000)::bigint)
                    WHEN "elevation_m" IS NOT NULL THEN jsonb_build_array("lat", "lng", "elevation_m")
                    ELSE jsonb_build_array("lat", "lng")
                END AS "point"
            FROM "track_points"
        ) AS p
        GROUP BY "track_id", "segment"
    ) AS g
    GROUP BY "track_id"
) AS s
WHERE t."id" = s."track_id";

-- A track can't be saved without points through the API, but don't let a
-- stray pointless row block the NOT NULL below.
UPDATE "tracks" SET "segments" = '[]'::jsonb WHERE "segments" IS NULL;

ALTER TABLE "tracks" ALTER COLUMN "segments" SET NOT NULL;

-- DropTable (data copied above)
DROP TABLE "track_points";
