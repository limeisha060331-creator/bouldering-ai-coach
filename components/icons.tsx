import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Download,
  Film,
  History,
  Info,
  Loader2,
  Mountain,
  Share2,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";

const iconClass = "shrink-0";

export const IconMountain = ({ className = "h-5 w-5" }: { className?: string }) => (
  <Mountain className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconUpload = ({ className = "h-6 w-6" }: { className?: string }) => (
  <Upload className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconVideo = ({ className = "h-5 w-5" }: { className?: string }) => (
  <Video className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconFilm = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Film className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
);

export const IconHistory = ({ className = "h-4 w-4" }: { className?: string }) => (
  <History className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
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

export const IconShare = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Share2 className={`${iconClass} ${className}`} strokeWidth={1.5} aria-hidden />
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
