"use strict";

/**
 * Remove the empty YAML list emitted by a freshly initialized dsh profile.
 *
 * A patch overlay must be one top-level YAML sequence. Appending a second
 * sequence item after a standalone `[]` creates two YAML documents and makes
 * Harness reject the overlay before boot.
 */
function normalizePatchContent(content) {
  const lines = content.split(/\r?\n/);
  const meaningful = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed !== "" && !trimmed.startsWith("#")) meaningful.push(index);
  }

  let emptyListIndex = meaningful[0];
  if (emptyListIndex !== void 0 && lines[emptyListIndex].trim() === "---") {
    emptyListIndex = meaningful[1];
  }
  if (emptyListIndex === void 0 || lines[emptyListIndex].trim() !== "[]") return content;

  lines.splice(emptyListIndex, 1);
  return lines.join("\n");
}

module.exports = { normalizePatchContent };
