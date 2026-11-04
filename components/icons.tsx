import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Film,
  Info,
  Loader2,
  Menu,
  Moon,
  Sun,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";

const iconClass = "shrink-0";

export const IconUpload = ({ className = "h-6 w-6" }: { className?: string }) => (
  <Upload className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconFilm = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Film className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconInfo = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Info className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconClock = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Clock className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconSparkles = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Sparkles className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconDownload = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Download className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconArrowLeft = ({ className = "h-4 w-4" }: { className?: string }) => (
  <ArrowLeft className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconChevronRight = ({ className = "h-4 w-4" }: { className?: string }) => (
  <ChevronRight className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconLoader = ({ className = "h-4 w-4 animate-spin" }: { className?: string }) => (
  <Loader2 className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconStar = ({
  className = "h-4 w-4",
  filled,
}: {
  className?: string;
  filled?: boolean;
}) => (
  <Star
    className={`${iconClass} ${filled ? "fill-current" : ""} ${className}`}
    strokeWidth={1.5}
    aria-hidden
  />
);

export const IconFileText = ({ className = "h-4 w-4" }: { className?: string }) => (
  <FileText className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconChevronDown = ({ className = "h-4 w-4" }: { className?: string }) => (
  <ChevronDown className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconMenu = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Menu className={`${iconClass} ${className}`} strokeWidth={2} aria-hidden />
);

export const IconX = ({ className = "h-4 w-4" }: { className?: string }) => (
  <X className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconSun = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Sun className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconMoon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Moon className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

