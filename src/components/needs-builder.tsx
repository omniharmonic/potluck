"use client";

import { Plus, GripVertical, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/emoji-picker";

export interface NeedItem {
  id: string;
  emoji: string;
  name: string;
  quantity: number;
  point_value: number | null;
}

interface NeedsBuilderProps {
  needs: NeedItem[];
  onChange: (needs: NeedItem[]) => void;
  pointsEnabled: boolean;
}

let nextId = 0;
function generateId() {
  return `need-${Date.now()}-${nextId++}`;
}

function SortableNeed({
  need,
  pointsEnabled,
  updateNeed,
  removeNeed,
}: {
  need: NeedItem;
  pointsEnabled: boolean;
  updateNeed: (id: string, updates: Partial<NeedItem>) => void;
  removeNeed: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: need.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card"
    >
      {/* Drag handle: pointer + touch drag, and keyboard-operable via dnd-kit's
          keyboard sensor (focus + space to lift, arrows to move). */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-label={`Reorder ${need.name || "need"}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <EmojiPicker
        value={need.emoji}
        onChange={(emoji) => updateNeed(need.id, { emoji })}
      />

      <Input
        aria-label="What's needed?"
        placeholder="What's needed?"
        value={need.name}
        onChange={(e) => updateNeed(need.id, { name: e.target.value })}
        className="flex-1 min-w-[120px]"
      />

      <div className="flex items-center gap-1 shrink-0">
        <label className="text-xs text-muted-foreground" htmlFor={`qty-${need.id}`}>
          Qty:
        </label>
        <Input
          id={`qty-${need.id}`}
          type="number"
          min={1}
          max={99}
          value={need.quantity}
          onChange={(e) =>
            updateNeed(need.id, {
              quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
            })
          }
          className="w-14 sm:w-16 text-center"
        />
      </div>

      {pointsEnabled && (
        <div className="flex items-center gap-1 shrink-0">
          <label className="text-xs text-muted-foreground" htmlFor={`pts-${need.id}`}>
            Pts:
          </label>
          <Input
            id={`pts-${need.id}`}
            type="number"
            min={0}
            value={need.point_value ?? 0}
            onChange={(e) =>
              updateNeed(need.id, {
                point_value: Math.max(0, parseInt(e.target.value, 10) || 0),
              })
            }
            className="w-14 sm:w-16 text-center"
          />
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${need.name || "need"}`}
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => removeNeed(need.id)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function NeedsBuilder({
  needs,
  onChange,
  pointsEnabled,
}: NeedsBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addNeed = () => {
    onChange([
      ...needs,
      {
        id: generateId(),
        emoji: "🍽️",
        name: "",
        quantity: 1,
        point_value: pointsEnabled ? 10 : null,
      },
    ]);
  };

  const updateNeed = (id: string, updates: Partial<NeedItem>) => {
    onChange(needs.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  };

  const removeNeed = (id: string) => {
    onChange(needs.filter((n) => n.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const from = needs.findIndex((n) => n.id === active.id);
      const to = needs.findIndex((n) => n.id === over.id);
      if (from !== -1 && to !== -1) onChange(arrayMove(needs, from, to));
    }
  };

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={needs.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {needs.map((need) => (
              <SortableNeed
                key={need.id}
                need={need}
                pointsEnabled={pointsEnabled}
                updateNeed={updateNeed}
                removeNeed={removeNeed}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        onClick={addNeed}
        className="w-full border-dashed"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add a need
      </Button>
    </div>
  );
}
