# Graph Island Settings Guide

A comprehensive guide to Graph Island's 160+ settings organized by panel tab.

## Panel Tabs

| Tab | Icon | Purpose |
|-----|------|---------|
| **Filter** | funnel | Control which nodes/edges are visible |
| **Display** | eye | Node appearance, edges, decorations |
| **Layout** | grid | Grouping, arrangement, force parameters |
| **Nodes** | list | Directory tree with visibility checkboxes |
| **Settings** | gear | Graph sync, plugin settings, ontology |

Keyboard: Press `1`-`4` to switch tabs, `P` to toggle panel.

---

## Filter Tab

### Filter Section

| Setting | Type | Description |
|---------|------|-------------|
| **Tag Display** | dropdown | `Hidden` / `Node` / `Enclosure` — how tags appear on the graph |
| **Orphans** | toggle | Show disconnected nodes (no edges) |
| **Auto-fit on filter** | toggle | Zoom to fit after filter changes |
| **Min Degree** | slider (0-20) | Hide nodes with fewer connections |
| **Max Degree** | slider (0-100) | Hide nodes with more connections |
| **Existing Files Only** | toggle | Hide nodes referencing non-existent files |
| **Attachments** | toggle | Include attachment files (images, PDFs) |
| **Search** | text | Filter nodes by query (see [Query Syntax](query-syntax.md)) |

### Groups Section

| Setting | Type | Description |
|---------|------|-------------|
| **Group By** | text | Field to group nodes (e.g. `category`, `tag:*`) |
| **Recursive** | toggle | Enable nested grouping |

---

## Display Tab

### Nodes Section

| Setting | Type | Description |
|---------|------|-------------|
| **Node Color Mode** | dropdown | `Default` / `Category` / `Heatmap` / `Community` / `Field` |
| **Node Size** | slider (1-100) | Base node radius in world units |
| **Text Fade Threshold** | slider | Zoom level below which labels start fading |
| **Label Density** | slider (0.2-3.0) | How many labels show at zoom-out |
| **Label Mode** | dropdown | `Auto` / `Initials` / `Truncated` / `Full` |
| **Label Max Chars** | slider (0-60) | Truncation limit (0 = unlimited) |
| **Size by Degree** | toggle | Scale node radius by connection count |
| **Sub-Label Fields** | text | Comma-separated frontmatter fields for sub-labels |
| **Hover Tooltip Fields** | text | Fields shown in hover tooltip |
| **Hover: Title/Meta/Body** | toggles | Control hover card content |
| **Node Icon Field** | text | Frontmatter field for node icons |
| **Icon Mapping (JSON)** | text | `{"value": "icon-name"}` mapping |
| **Hover Highlight Hops** | slider (0-10) | BFS depth for neighbor highlighting |
| **Max Hover Labels** | slider (5-100) | Cap on neighbor labels during hover |
| **Focus Mode** | toggle | Click to lock highlight on a node |
| **Shape Rules** | select | Tag/category → shape mapping |

### Display Mode Section

| Setting | Type | Description |
|---------|------|-------------|
| **Display Mode** | dropdown | `Node` / `Card` / `Donut` |

Card mode shows full metadata cards. Donut mode shows pie charts per node.

### Node Decorations Section

| Setting | Type | Description |
|---------|------|-------------|
| **Semantic Zoom** | toggle | Tier-based detail at different zoom levels |
| **Auto LOD** | toggle | Automatic level-of-detail switching |
| **Tag Badges** | toggle | Small HSL-colored tag badges below nodes |
| **Importance Ring** | toggle | Colored ring proportional to betweenness centrality |
| **Recency Marker** | toggle | Green dot on recently modified files |
| **Definition Field** | text | Frontmatter field shown in card mode |
| **Node Thumbnails** | toggle | Show image thumbnails from frontmatter |

### Structure Analysis Section

| Setting | Type | Description |
|---------|------|-------------|
| **Ontology Backbone** | toggle | Thicken inheritance edges |
| **Cluster Label Detail** | dropdown | `Minimal` / `Standard` / `Detailed` / `Rich` |
| **Pattern Highlight** | toggle | Highlight structural patterns (bridges, hubs) |
| **Relation Matrix** | toggle | Show top-20 node adjacency matrix |

### Discovery & Insight Section

| Setting | Type | Description |
|---------|------|-------------|
| **Similar Suggestions** | toggle | Jaccard similarity on hover |
| **Structure Questions** | toggle | AI-generated structural insights |
| **Analysis Overlay** | dropdown | `Off` / `Bridges` / `Entropy` / `Missing` / `Density` / `All` |
| **Cluster Compare** | toggle | Select two clusters to compare |
| **Hierarchy Tree** | toggle | Overlay inheritance tree structure |

### Edges Section

| Setting | Type | Description |
|---------|------|-------------|
| **Arrows** | toggle | Show directional arrowheads |
| **Edge Fade (by Degree)** | toggle | Fade low-degree edges |
| **Edge Opacity** | slider (0.05-1.0) | Global edge alpha multiplier |
| **Edge Min Zoom** | slider (0-0.1) | Below this zoom, edges hidden |
| **Edge Zoom Fade** | slider (0.1-1.0) | Gradual fade threshold |
| **Edge Label Font Size** | slider (6-18) | Edge label text size |
| **Edge Density Floor** | slider (0.02-0.5) | Minimum alpha for dense edge areas |
| **Hover Edge Fade** | slider (0.3-0.95) | Alpha falloff per hop on hover |

Advanced (collapsed):
- **Edge Color (by Relation)** — colorize by relationship type
- **Edge Label Mode** — `None` / `Relation` / `Weight` / `Cardinality`
- **Edge Direction Filter** — `All` / `Bidirectional` / `Unidirectional`
- **Bidirectional Indicator** — thicken mutual edges
- **Edge Strength Glow** — width by target in-degree

### Other Section

| Setting | Type | Description |
|---------|------|-------------|
| **Show Legend** | toggle | Color legend overlay (keyboard: `L`) |
| **Show Minimap** | toggle | Navigation minimap (keyboard: `M`) |
| **Show Stats** | toggle | Graph statistics panel |
| **Breadcrumb** | toggle | Hierarchy path bar |
| **Out-of-Bounds Badge** | toggle | Count off-screen nodes |
| **Density Badge** | toggle | Label cull statistics |
| **Dot Grid** | toggle | Background grid (keyboard: `G`) |

### Rendering Thresholds Section

Performance tuning — collapsed by default. Controls gradient/glow/card thresholds, FPS monitor, label cooldown, and more.

---

## Layout Tab

### Grouping Section

| Setting | Type | Description |
|---------|------|-------------|
| **Cluster Arrangement** | dropdown | `Grid` / `Concentric` / `Radial` / `Phyllotaxis` / `Timeline` / `Random` / `Custom` / `Ego` |

### Cluster Arrangement Section

Force parameters (vary by arrangement):
- **Center Force** — attraction toward center
- **Repel Force** — node repulsion strength
- **Link Force** — edge spring strength
- **Link Distance** — target edge length
- **Edge Bundle Strength** — edge bundling intensity
- **Group Scale** / **Group Spacing** / **Node Spacing**

### Node Rules Section

Custom per-node rules: size, color, visibility overrides by query.

---

## Nodes Tab

Directory tree showing all vault files. Features:
- Checkbox to show/hide individual nodes
- Folder-level batch toggle
- Click to jump to node on graph
- Color dot matching graph coloring
- Stats bar (total/visible/hidden)
- CSV export button

---

## Settings Tab

### Graph Sync Section

| Setting | Type | Description |
|---------|------|-------------|
| **Sync with Editor** | toggle | Follow active file |
| **Local Graph Center** | text | Center on specific node |
| **Local Graph Hops** | slider (1-10) | BFS radius from center |

### Plugin Settings Section

| Setting | Type | Description |
|---------|------|-------------|
| **High Contrast Mode** | toggle | Thicker strokes, higher contrast |
| **Presentation Mode** | toggle | Waypoint-based guided tour |
| **Zoom Sensitivity** | slider (0.3-2.0) | Mouse wheel zoom speed |

### Ontology Section

Define relationship types (inheritance, aggregation, etc.) for Excalibrain-style ontology edges.

### Custom Mappings / Tag Relations

Map custom field names to ontology types.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `F` | Fit view |
| `+` / `-` | Zoom in/out |
| `0`-`9` | Zoom to 10%-100% |
| `P` | Toggle panel |
| `L` | Toggle legend |
| `M` | Toggle minimap |
| `G` | Toggle grid |
| `Tab` | Cycle focus through nodes |
| `Enter` | Open focused node's file |
| `Shift+Enter` | Add to multi-select |
| `Ctrl+Enter` | Add to comparison |
| `Arrow keys` | Pan graph (or navigate neighbors when focused) |
| `[` / `]` | Decrease/increase hover hops |
| `Z` | Focus-zoom to highlighted node |
| `S` / `E` | Set pathfinder start/end |
| `?` | Help overlay |
| `Escape` | Close overlays / clear focus |
| `Ctrl+A` | Select all |
| `Ctrl+D` | Deselect all |
| `Ctrl+Shift+C` | Copy graph as PNG |

---

## Presets

Quick presets available in the toolbar:

| Preset | Description |
|--------|-------------|
| **Simple** | Links only, no decorations |
| **Analysis** | All edges + colors + arrows |
| **Creative** | Links + tags + enclosures |
| **Explore** | Follow active file, focus cone |
| **Analyze** | Stats, bridges, community colors |
| **Write** | Minimal 1-hop local graph |

---

## FAQ

**Q: Too many settings — where do I start?**
A: Use the toolbar presets (Simple/Analysis/Creative). Customize from there.

**Q: Labels are overlapping at zoom-out.**
A: Increase **Label Density** slider, or use **Label Mode: Initials**.

**Q: The graph is slow with many nodes.**
A: Enable **Auto LOD**, reduce **Hover Hops**, or increase **Edge Min Zoom**.

**Q: How do I color nodes by a custom field?**
A: Set **Node Color Mode** to `By Field`, then enter the frontmatter field name.

**Q: Edges are invisible.**
A: Check **Edge Opacity** (might be very low) and **Edge Min Zoom** (might be too high).

**Q: How do I export the graph?**
A: `Ctrl+Shift+C` copies as PNG. Or use the camera button in the toolbar.
