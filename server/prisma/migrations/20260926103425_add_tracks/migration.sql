-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "source_format" TEXT NOT NULL,
    "owner_user_id" UUID,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_date" DATE,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_points" (
    "id" BIGSERIAL NOT NULL,
    "track_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "segment" INTEGER NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "elevation_m" DOUBLE PRECISION,
    "recorded_at" TIMESTAMPTZ,

    CONSTRAINT "track_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "track_points_track_id_sequence_idx" ON "track_points"("track_id", "sequence");

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_points" ADD CONSTRAINT "track_points_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
