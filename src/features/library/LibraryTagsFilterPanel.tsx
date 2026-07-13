import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { TogglePill } from "@/components/common/TogglePill";
import {
  MAX_LIBRARY_TAGS_PANEL_HEIGHT,
  MIN_LIBRARY_TAGS_PANEL_HEIGHT,
  persistLibraryTagsPanelHeight,
  readLibraryTagsPanelHeight,
} from "@/services/libraryFiltersPersistence";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import "./LibraryTagsFilterPanel.css";

export interface LibraryTagsFilterPanelProps {
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  className?: string;
}

/**
 * @description Volet genres/thèmes : recherche locale et hauteur redimensionnable.
 */
export function LibraryTagsFilterPanel({
  tags,
  selectedTags,
  onToggleTag,
  className = "",
}: LibraryTagsFilterPanelProps) {
  const [query, setQuery] = useState("");
  const [height, setHeight] = useState(readLibraryTagsPanelHeight);
  const heightRef = useRef(height);

  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  const filteredTags = useMemo(() => {
    const needle = normalizeTitleForComparison(query);
    if (!needle) {
      return tags;
    }
    return tags.filter((tag) =>
      normalizeTitleForComparison(tag).includes(needle),
    );
  }, [query, tags]);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = heightRef.current;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    const handleMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(
        MAX_LIBRARY_TAGS_PANEL_HEIGHT,
        Math.max(
          MIN_LIBRARY_TAGS_PANEL_HEIGHT,
          startHeight + moveEvent.clientY - startY,
        ),
      );
      setHeight(nextHeight);
    };

    const handleStop = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleStop);
      persistLibraryTagsPanelHeight(heightRef.current);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleStop);
  }, []);

  return (
    <div className={`library-tags-filter-panel ${className}`.trim()}>
      <label className="library-tags-filter-panel__search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Rechercher un tag…"
          aria-label="Rechercher un tag"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div
        className="library-tags-filter-panel__pills app-scroll-themed app-scroll-themed-y"
        style={{ height: `${height}px` }}
      >
        {filteredTags.length > 0 ? (
          filteredTags.map((tag) => (
            <TogglePill
              key={tag}
              label={tag}
              active={selectedTags.includes(tag)}
              onClick={() => onToggleTag(tag)}
            />
          ))
        ) : (
          <p className="library-tags-filter-panel__empty">Aucun tag trouvé.</p>
        )}
      </div>
      <button
        type="button"
        className="library-tags-filter-panel__resize-handle"
        aria-label="Redimensionner la zone des tags"
        title="Glisser pour agrandir ou réduire"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}
