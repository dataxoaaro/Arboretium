# Arboretum Mapper

A personal app for documenting the plants and trees on a private property,
anchored to Uber's H3 hexagonal grid over satellite imagery.

## Language

### Spatial model

**Property**:
A named, bounded piece of land (a boundary plus the set of H3 cells it
includes). The unit a user selects to work inside. Created and archived only by
the admin.

**Cell**:
A single H3 resolution-15 hexagon (~0.9 m²) — the atomic spatial anchor for
plants, notes, and photos. "Hex" is the casual synonym used in UI copy.
_Avoid_: tile, square, point.

**Zone**:
A coarser parent hexagon (res 12 or 13) used to group and filter cells (e.g.
"northwest corner"). A zone contains many cells; never confuse the two.
_Avoid_: region, area, sector.

**Plant**:
A documented living plant or tree, anchored to exactly one cell. A cell may
hold zero, one, or several plants.

**Occupied cell**:
A cell that has at least one non-archived plant, OR at least one cell photo, OR
a non-empty cell note. Soft-deleted plants and empty/cleared notes do not count.
Drives the "Occupied only" visibility mode and Full-mode coloring.

**Planted cell**:
An occupied cell that contains at least one plant. Rendered with the plant
marker style.

**Annotated cell**:
An occupied cell with notes and/or photos but no plants. Rendered with a
distinct marker from a planted cell (it carries documentation about the spot
itself, not a plant).
