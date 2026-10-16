import {
  Apple,
  Bath,
  Beef,
  Bed,
  Bike,
  BookOpen,
  Brain,
  Brush,
  Candy,
  Check,
  CigaretteOff,
  Code,
  Coffee,
  Dog,
  Droplet,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  Gamepad2,
  Guitar,
  HandHeart,
  Heart,
  Languages,
  LayoutList,
  Leaf,
  Moon,
  Pause,
  Plane,
  GripVertical,
  SkipForward,
  StickyNote,
  Medal,
  ChartLine,
  Settings2,
  Zap,
  Music,
  PenLine,
  PersonStanding,
  PhoneOff,
  PiggyBank,
  Pill,
  Salad,
  Shirt,
  Smile,
  Snowflake,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  Tv,
  Utensils,
  Waves,
  Wind,
  WineOff,
} from "lucide-react";
import type { Icon } from "../icons";
import { habitColor, habitColor2 } from "@/lib/habits/meta";

export const IconList: Icon = LayoutList;
export const IconSkip: Icon = SkipForward;
export const IconPause: Icon = Pause;
export const IconVacation: Icon = Plane;
export const IconGrip: Icon = GripVertical;
export const IconNote: Icon = StickyNote;
export const IconMedal: Icon = Medal;
export const IconTrend: Icon = ChartLine;
export const IconHabitSettings: Icon = Settings2;
export const IconAuto: Icon = Zap;
export const IconFlame: Icon = Flame;

/** Icons a habit can have, by the key stored on the habit. */
export const HABIT_ICONS: Record<string, Icon> = {
  check: Check,
  droplet: Droplet,
  beef: Beef,
  salad: Salad,
  apple: Apple,
  utensils: Utensils,
  coffee: Coffee,
  pill: Pill,
  dumbbell: Dumbbell,
  footprints: Footprints,
  bike: Bike,
  waves: Waves,
  person: PersonStanding,
  flame: Flame,
  book: BookOpen,
  pen: PenLine,
  languages: Languages,
  code: Code,
  music: Music,
  guitar: Guitar,
  brain: Brain,
  flower: Flower2,
  wind: Wind,
  heart: Heart,
  "hand-heart": HandHeart,
  smile: Smile,
  sparkles: Sparkles,
  bath: Bath,
  brush: Brush,
  shirt: Shirt,
  bed: Bed,
  moon: Moon,
  sun: Sun,
  sunrise: Sunrise,
  snowflake: Snowflake,
  leaf: Leaf,
  dog: Dog,
  "piggy-bank": PiggyBank,
  target: Target,
  "phone-off": PhoneOff,
  "cigarette-off": CigaretteOff,
  "wine-off": WineOff,
  candy: Candy,
  tv: Tv,
  gamepad: Gamepad2,
};
export const ICON_KEYS = Object.keys(HABIT_ICONS);

/** A habit's icon on a disc of its colour, like an iOS settings icon. */
export function HabitBadge({ icon, color, size = 36, muted }: { icon: string; color: string; size?: number; muted?: boolean }) {
  const I = HABIT_ICONS[icon] ?? Check;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        background: muted ? "var(--surface-2)" : `linear-gradient(145deg, ${habitColor2(color)}, ${habitColor(color)})`,
        color: muted ? "var(--muted)" : "#fff",
      }}
    >
      <I width={size * 0.5} height={size * 0.5} strokeWidth={2.3} />
    </span>
  );
}
