# Calem Test Checklist

Automated: `npm test` (vitest — 117 tests under `tests/`: paper/select/erase/config/membership/auth/storage/sync/billing/geometry/text/pointerState).
Everything below is a manual/E2E checklist. Each row states the **expected result**.

## 0. Setup
- `npm install`, `npm run dev` → http://127.0.0.1:5174 (clean profile, empty IndexedDB).
- Reload the page before each section (fresh state); a single page unless stated otherwise.

## 1. Drawing
| # | Step | Expected |
|---|------|----------|
| 1.1 | Draw a horizontal line with the pen | Unbroken ink, HUD shows `1 line`, point count > 5 |
| 1.2 | Go over it with the highlighter | Translucent yellow band, the line underneath stays visible |
| 1.3 | Set width to 20 and tap (click-release) | A thick dot appears |
| 1.4 | Draw past the page edge | Ink is clipped at the page border, nothing spills outside |

## 2. Eraser
| # | Step | Expected |
|---|------|----------|
| 2.1 | Cross the middle of a line with the standard eraser | The line splits in two (`2 lines`), the background (pattern) stays spotless |
| 2.2 | Erase on ruled paper | The rules remain where you erased (no paper-coloured smudge) |
| 2.3 | Erase over a PDF with the standard eraser | PDF text/image is not punched through, only ink goes away |
| 2.4 | Switch to stroke mode and touch a line | The whole line disappears |
| 2.5 | Erase over a text box (both modes) | The box disappears |
| 2.6 | Ctrl+Z after erasing | The whole drag comes back in one step (not piece by piece) |

## 3. Selection / move / clipboard
| # | Step | Expected |
|---|------|----------|
| 3.1 | Select tool + drag a rectangle | Dashed bbox + corner handles |
| 3.2 | Lasso around strokes | Only those with a point inside are selected |
| 3.3 | Drag the selection | Everything selected moves together and stays on the page |
| 3.4 | Ctrl+C → another page → Ctrl+V | The copy gets fresh ids, arrives slightly offset and selected |
| 3.5 | Del | The selection goes away; Ctrl+Z brings it back |
| 3.6 | Arrow keys (with Shift) | 2pt nudge (Shift: 10pt) |

## 4. Shapes + style
| # | Step | Expected |
|---|------|----------|
| 4.1 | Drag line/rect/ellipse/arrow | Live preview, on release the primitive remains |
| 4.2 | Draw with dashed + 50% opacity | A dashed, faded line |
| 4.3 | L/R/O/A/T/G shortcuts | The matching tool becomes active |

## 5. Text / images
| # | Step | Expected |
|---|------|----------|
| 5.1 | Click empty space with the text tool, type, Done | Text is committed to the canvas |
| 5.2 | Click the text | The editor opens with the content |
| 5.3 | Drag the text | The box moves |
| 5.4 | Leave it empty and close | The box is discarded (no empty text in the save) |
| 5.5 | Click with the image tool, pick a PNG | The image is centred on the click point, the panel opens |
| 5.6 | Size slider + Delete | Scales while keeping the aspect ratio; Delete removes it |
| 5.7 | Reload | Text + image come back exactly as they were (IDB) |

## 6. Layers
| # | Step | Expected |
|---|------|----------|
| 6.1 | Layers panel → + Add, draw | The new layer is on top and becomes active |
| 6.2 | Hide it (eye icon) | That layer's ink is hidden |
| 6.3 | Delete a layer (with ink) | Confirm is asked, it deletes; Ctrl+Z restores it |
| 6.4 | Reload | Layers + visibility are preserved |

## 7. Paper / pages / view
| # | Step | Expected |
|---|------|----------|
| 7.1 | Pattern: ruled/graph/dotted/staff + margin | Renders on the canvas instantly, applied to PNG/PDF export |
| 7.2 | Add/duplicate/move left-right/delete a page | Counters are correct, undo brings the page back |
| 7.3 | Page strip (2+ pages) | Thumbnails are current, clicking navigates, the active one is ringed |
| 7.4 | Turn on scroll mode | Pages stack vertically, drawing works on the active one, the wheel scrolls |
| 7.5 | Hand tool + Space-drag | Pans without smearing ink |
| 7.6 | Pinch / Ctrl+wheel | Cursor-anchored zoom, the % label updates |

## 8. Undo / redo
| # | Step | Expected |
|---|------|----------|
| 8.1 | Draw → erase → move → text → undo ×4 | Each action is reverted in order |
| 8.2 | New ink after an undo | Redo dies (Redo is disabled) |
| 8.3 | Switch page → undo | The action on the old page is reverted (global history) |
| 8.4 | Undo button | Disabled while history is empty |

## 9. Toolbar
| # | Step | Expected |
|---|------|----------|
| 9.1 | Settings → hide a tool (e.g. Pen) | The button disappears; still gone after a reload (persisted) |
| 9.2 | Move Hand to the front | Hand becomes the first button |
| 9.3 | Reset | Default order + everything visible |
| 9.4 | Try to hide the last tool | Blocked (at least one tool remains) |

## 10. Files
| # | Step | Expected |
|---|------|----------|
| 10.1 | Open a PDF (multi-page) | Pages become the PDF, with a warning that ink is not preserved |
| 10.2 | Draw on it → Write PDF | Vector PDF: selectable text, crisp lines, small file |
| 10.3 | Standard eraser + PDF → Write PDF | The page falls back to raster but the PDF background is not punched through |
| 10.4 | Save Calem → reset → Open Calem | Pages + settings + images come back exactly |
| 10.5 | Open a corrupt .calem | Error message, the scene is preserved |

## 11. Theme / menu / presentation
| # | Step | Expected |
|---|------|----------|
| 11.1 | Light theme | Menu buttons + select lists are readable (no white on white) |
| 11.2 | Click outside / Esc while the menu is open | The menu closes, drawing is unaffected |
| 11.3 | Presentation (F) | Fullscreen + minimal chrome, counter + Exit; Esc leaves |
| 11.4 | Settings modal + backdrop click | Centred window, scrollable body; the backdrop closes it |
| 11.5 | Drag with a finger while touch-scroll is on | The screen scrolls, no ink is smeared |
| 11.6 | Reload | Theme + toolbar + paper + smoothing + touch-scroll are preserved |

## 12. Regression gate (before every push)
- `npm run type-check` clean, `npm run build-only` clean, `npm test` 117/117.

## 13. Input / closing (mobile + tablet)
| # | Step | Expected |
|---|------|----------|
| 13.1 | Try to close the tab <1s after drawing | The browser asks for confirmation (work is still queued) |
| 13.2 | Wait, then close | No prompt (autosave wrote to IDB); the banner offers restore on next open |
| 13.3 | Draw quickly in a row (handwriting pace) | The first point is not swallowed, the line starts exactly at the start |
| 13.4 | Drag the page fast with the hand tool | No stutter, the last millimetre on release is applied |
| 13.5 | Erase a small circle with the standard eraser | No dot leftovers, the arc is cut cleanly |
