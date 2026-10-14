import type { ComponentType, SVGProps } from "react";
import {
  Activity,
  Apple,
  Armchair,
  Bed,
  Beef,
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  CalendarSync,
  Camera,
  ChartColumn,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Croissant,
  Download,
  Droplet,
  Dumbbell,
  Ellipsis,
  Flag,
  Flame,
  Footprints,
  Globe,
  LayoutGrid,
  HeartPulse,
  HardHat,
  House,
  Leaf,
  Lightbulb,
  Mars,
  Mic,
  Minus,
  Moon,
  Pencil,
  Plus,
  Repeat,
  Route,
  Ruler,
  Salad,
  Scale,
  ScanBarcode,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Sun,
  Sunrise,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Undo2,
  Users,
  UtensilsCrossed,
  Venus,
  Volleyball,
  Wheat,
  X,
  Zap,
} from "lucide-react";
import type { ActivityLevel, GoalType, MealSlot, WorkoutType } from "@/lib/types";

/** Every icon takes ordinary SVG props (width, height, className…). */
export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Navigation and actions
export const IconToday: Icon = House;
export const IconPlus: Icon = Plus;
export const IconMinus: Icon = Minus;
export const IconChart: Icon = ChartColumn;
export const IconCalendar: Icon = CalendarDays;
export const IconSettings: Icon = Settings;
export const IconBarcode: Icon = ScanBarcode;
export const IconSearch: Icon = Search;
export const IconTrash: Icon = Trash2;
export const IconCopy: Icon = Copy;
export const IconChevronLeft: Icon = ChevronLeft;
export const IconChevronRight: Icon = ChevronRight;
export const IconChevronDown: Icon = ChevronDown;
export const IconClose: Icon = X;
export const IconBolt: Icon = Zap;
export const IconMore: Icon = Ellipsis;
export const IconBookmark: Icon = Bookmark;
export const IconCamera: Icon = Camera;
export const IconCheck: Icon = Check;
export const IconUndo: Icon = Undo2;
export const IconEdit: Icon = Pencil;
export const IconSparkles: Icon = Sparkles;
export const IconBell: Icon = Bell;
export const IconCalendarSync: Icon = CalendarSync;
export const IconDownload: Icon = Download;
export const IconTarget: Icon = Target;
export const IconScale: Icon = Scale;
export const IconRuler: Icon = Ruler;
export const IconUsers: Icon = Users;
export const IconPhone: Icon = Smartphone;
export const IconBook: Icon = BookOpen;
export const IconChef: Icon = ChefHat;
export const IconMeal: Icon = UtensilsCrossed;
export const IconIdea: Icon = Lightbulb;
export const IconClock: Icon = Clock;
export const IconTrophy: Icon = Trophy;
export const IconFlag: Icon = Flag;
export const IconGlobe: Icon = Globe;
export const IconStore: Icon = Store;
export const IconMale: Icon = Mars;
export const IconFemale: Icon = Venus;
export const IconBed: Icon = Bed;

// Nutrition
export const IconEnergy: Icon = Flame;
export const IconProtein: Icon = Beef;
export const IconCarbs: Icon = Wheat;
export const IconFat: Icon = Droplet;
export const IconFibre: Icon = Leaf;
export const IconWater: Icon = Droplet;
export const IconStreak: Icon = Flame;

export const SLOT_ICONS: Record<MealSlot, Icon> = {
  breakfast: Sunrise,
  lunch: Salad,
  dinner: Moon,
  snack: Apple,
  pre_workout: Zap,
  post_workout: Croissant,
};

export const WORKOUT_ICONS: Record<WorkoutType, Icon> = {
  soccer: Volleyball,
  run: Footprints,
  long_run: Route,
  gym: Dumbbell,
  rest: Armchair,
};

export const ACTIVITY_ICONS: Record<ActivityLevel, Icon> = {
  sedentary: Armchair,
  light: Footprints,
  moderate: Activity,
  very: Dumbbell,
  extra: HardHat,
};

export const GOAL_ICONS: Record<GoalType, Icon> = {
  cut: TrendingDown,
  maintain: Scale,
  recomp: Target,
  bulk: TrendingUp,
};

export const IconSun: Icon = Sun;
export const IconMoon: Icon = Moon;
export const IconDumbbell: Icon = Dumbbell;
export const IconRest: Icon = Armchair;
export const IconHeart: Icon = HeartPulse;
export const IconGrid: Icon = LayoutGrid;
export const IconMic: Icon = Mic;
export const IconStar: Icon = Star;
export const IconTrending: Icon = TrendingUp;
export const IconRepeat: Icon = Repeat;
