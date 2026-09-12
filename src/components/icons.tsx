// Ícones do sistema — biblioteca padrão (lucide-react), reexportados sob nomes
// estáveis (Icon*) para manter os componentes existentes sem alterações.
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Building2,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Menu,
  Moon,
  Package,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Sun,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideProps,
} from "lucide-react";

export const IconDashboard = LayoutDashboard;
export const IconUpload = Upload;
export const IconMenu = Menu;
export const IconClose = X;
export const IconBuilding = Building2;
export const IconWallet = Wallet;
export const IconBox = Package;
export const IconTrophy = Trophy;
export const IconTrend = TrendingUp;
export const IconSun = Sun;
export const IconMoon = Moon;
export const IconSearch = Search;
export const IconChevronLeft = ChevronLeft;
export const IconChevronRight = ChevronRight;
export const IconSort = ArrowUpDown;
export const IconInbox = Inbox;
export const IconCheck = Check;
export const IconAlert = AlertTriangle;
export const IconFile = FileText;
export const IconUsers = Users;
export const IconLogout = LogOut;
export const IconActivity = Activity;
export const IconClock = Clock;
export const IconShield = Shield;
export const IconBell = Bell;
export const IconUser = User;
export const IconTool = Wrench;
export const IconClipboard = ClipboardList;
export const IconLayers = Layers;
export const IconPlus = Plus;
export const IconFilter = Filter;
export const IconTrash = Trash2;
export const IconPencil = Pencil;
export const IconChevronDown = ChevronDown;
export const IconCamera = Camera;
export const IconKey = KeyRound;
export const IconImage = ImageIcon;
export const IconSave = Save;
export const IconPalette = Palette;
export const IconMail = Mail;
export const IconLock = Lock;
export const IconEye = Eye;
export const IconEyeOff = EyeOff;
export const IconArrowRight = ArrowRight;
export const IconArrowUp = ArrowUp;
export const IconArrowDown = ArrowDown;
export const IconCalendar = Calendar;
export const IconGrip = GripVertical;
export const IconRefresh = RefreshCw;

/** Spinner com rotação automática (mantém o comportamento do ícone anterior). */
export function IconSpinner({ className, ...props }: LucideProps) {
  return <Loader2 {...props} className={`animate-spin ${className ?? ""}`} />;
}
