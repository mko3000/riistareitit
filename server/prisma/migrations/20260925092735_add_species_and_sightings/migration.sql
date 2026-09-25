-- CreateTable
CREATE TABLE "species" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name_fi" TEXT NOT NULL,
    "name_en" TEXT,
    "icon" TEXT NOT NULL,
    "is_preset" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sightings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "species_id" UUID,
    "custom_species" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'sighting',
    "notes" TEXT,
    "person_display" TEXT NOT NULL DEFAULT 'unknown',
    "created_by_user_id" UUID,
    "observed_date" DATE NOT NULL,
    "observed_time" TIME,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sightings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "species_key_key" ON "species"("key");

-- CreateIndex
CREATE INDEX "sightings_observed_date_idx" ON "sightings"("observed_date");

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint
-- Prisma's schema DSL has no way to express these (no `@@check` support for
-- arbitrary expressions as of Prisma 6) -- hand-added, matching the original
-- design in docs/SPEC.md §4. Not represented in schema.prisma; Prisma won't
-- touch or drop these on future migrations since nothing there contradicts
-- them, same as any other DB object Prisma doesn't model (see e.g. the
-- gen_random_uuid() defaults, which use `dbgenerated` for the same reason).
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_species_or_custom_check" CHECK ("species_id" IS NOT NULL OR "custom_species" IS NOT NULL);
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_kind_check" CHECK ("kind" IN ('sighting', 'kill'));
