"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { EMOJI_CATEGORIES } from "@/lib/emoji-data";
import { COMMON_EMOJIS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Search } from "lucide-react";

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

const EMOJI_SEARCH_TERMS: Record<string, string[]> = {
  "🍕": ["pizza"], "🍔": ["burger", "hamburger"], "🌮": ["taco"],
  "🌯": ["burrito"], "🥗": ["salad"], "🍝": ["pasta", "spaghetti"],
  "🍜": ["noodle", "ramen"], "🍣": ["sushi"], "🍰": ["cake"],
  "🎂": ["birthday", "cake"], "🍪": ["cookie"], "🍩": ["donut"],
  "🍫": ["chocolate"], "🍦": ["ice cream"], "☕": ["coffee"],
  "🍵": ["tea"], "🍺": ["beer"], "🍷": ["wine"], "🥂": ["champagne", "cheers"],
  "🥤": ["drink", "soda", "cup"], "🧃": ["juice", "box"],
  "🍞": ["bread"], "🧀": ["cheese"], "🥩": ["meat", "steak"],
  "🍗": ["chicken"], "🥕": ["carrot"], "🌽": ["corn"],
  "🍎": ["apple"], "🍌": ["banana"], "🍓": ["strawberry"],
  "🍉": ["watermelon"], "🥑": ["avocado"], "🍋": ["lemon"],
  "🫖": ["teapot"], "🍶": ["sake"], "🧊": ["ice"],
  "🎉": ["party", "celebrate"], "🎈": ["balloon"], "🎁": ["gift", "present"],
  "🏆": ["trophy", "winner"], "🎤": ["microphone", "karaoke", "sing"],
  "🎸": ["guitar"], "🎹": ["piano", "keyboard"], "🎶": ["music", "song"],
  "🎵": ["music", "note"], "🎲": ["game", "dice"], "🎮": ["game", "video"],
  "🧩": ["puzzle"], "🎨": ["art", "paint"], "📷": ["camera", "photo"],
  "🎬": ["movie", "film"], "🪴": ["plant"], "🌸": ["flower", "cherry"],
  "🌹": ["rose"], "🌻": ["sunflower"], "💐": ["bouquet", "flowers"],
  "🕯️": ["candle"], "💡": ["light", "idea", "bulb"],
  "🔌": ["plug", "electric"], "🪑": ["chair", "seat"],
  "🧺": ["basket", "laundry"], "🗑️": ["trash", "bin"],
  "🧻": ["toilet paper", "tissue"], "📦": ["box", "package"],
  "🎪": ["circus", "tent"], "🏕️": ["camping", "tent"],
  "🍽️": ["plate", "dining"], "🥄": ["spoon"], "🔪": ["knife"],
  "🧂": ["salt"], "❤️": ["heart", "love"], "🙏": ["pray", "thanks"],
  "👏": ["clap", "applause"], "🤝": ["handshake", "deal"],
  "💪": ["strong", "muscle"], "👍": ["thumbs up", "like"],
  "✅": ["check", "done"], "⭐": ["star"], "🔥": ["fire", "hot"],
  "✨": ["sparkle", "magic"], "🎯": ["target", "goal", "bullseye"],
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function EmojiGrid({
  search,
  onSelect,
}: {
  search: string;
  onSelect: (emoji: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const matches: string[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      // Also match the category name so e.g. "food" surfaces a whole section.
      const categoryMatches = cat.name.toLowerCase().includes(q);
      for (const emoji of cat.emojis) {
        if (categoryMatches) {
          matches.push(emoji);
          continue;
        }
        const terms = EMOJI_SEARCH_TERMS[emoji];
        if (terms?.some((t) => t.includes(q))) {
          matches.push(emoji);
        }
      }
    }
    return Array.from(new Set(matches));
  }, [search]);

  const scrollToCategory = (name: string) => {
    setActiveCategory(name);
    const el = scrollRef.current?.querySelector(`[data-category="${name}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {!search.trim() && (
        <div className="flex gap-0.5 px-4 pb-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setActiveCategory(null);
              scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`shrink-0 h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-lg sm:text-base rounded-md transition-colors ${
              !activeCategory ? "bg-muted" : "hover:bg-muted/50"
            }`}
            title="Frequently Used"
            aria-label="Frequently used emojis"
          >
            <span aria-hidden="true">⏱️</span>
          </button>
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => scrollToCategory(cat.name)}
              className={`shrink-0 h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center text-lg sm:text-base rounded-md transition-colors ${
                activeCategory === cat.name ? "bg-muted" : "hover:bg-muted/50"
              }`}
              title={cat.name}
              aria-label={cat.name}
            >
              <span aria-hidden="true">{cat.icon}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-y-auto px-4 pb-4"
        style={{ maxHeight: "min(50vh, 360px)" }}
        onScroll={() => {
          if (search.trim() || !scrollRef.current) return;
          const container = scrollRef.current;
          const headers = container.querySelectorAll("[data-category]");
          let current: string | null = null;
          headers.forEach((h) => {
            const rect = h.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            if (rect.top <= containerRect.top + 40) {
              current = h.getAttribute("data-category");
            }
          });
          if (current) setActiveCategory(current);
        }}
      >
        {search.trim() ? (
          filteredCategories && filteredCategories.length > 0 ? (
            <div className="grid grid-cols-7 sm:grid-cols-8 gap-0.5">
              {filteredCategories.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  aria-label={`Choose ${emoji}`}
                  className="h-11 w-11 sm:h-9 sm:w-9 mx-auto flex items-center justify-center text-2xl sm:text-xl rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No emojis found for &ldquo;{search}&rdquo;
            </p>
          )
        ) : (
          <>
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Frequently Used
              </p>
              <div className="grid grid-cols-7 sm:grid-cols-8 gap-0.5">
                {COMMON_EMOJIS.slice(0, 14).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Choose ${emoji}`}
                    className="h-11 w-11 sm:h-9 sm:w-9 mx-auto flex items-center justify-center text-2xl sm:text-xl rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                    onClick={() => onSelect(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.name} className="mb-3" data-category={cat.name}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 sticky top-0 bg-background py-1 z-10">
                  {cat.name}
                </p>
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-0.5">
                  {cat.emojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      aria-label={`Choose ${emoji}`}
                      className="h-11 w-11 sm:h-9 sm:w-9 mx-auto flex items-center justify-center text-2xl sm:text-xl rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                      onClick={() => onSelect(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setSearch("");
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) setSearch("");
  };

  const trigger = (
    <Button
      variant="outline"
      size="icon"
      className="h-10 w-10 text-xl shrink-0"
      type="button"
    >
      {value}
    </Button>
  );

  const searchInput = (
    <div className="px-4 pb-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          aria-label="Search emojis"
          placeholder="Search emojis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-10 sm:h-9 text-sm"
        />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle>Pick an emoji</DrawerTitle>
          </DrawerHeader>
          {searchInput}
          <EmojiGrid search={search} onSelect={handleSelect} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Pick an emoji</DialogTitle>
        </DialogHeader>
        {searchInput}
        <EmojiGrid search={search} onSelect={handleSelect} />
      </DialogContent>
    </Dialog>
  );
}
