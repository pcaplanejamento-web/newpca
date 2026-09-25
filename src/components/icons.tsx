// Ícones do sistema — biblioteca padrão (lucide-react), reexportados sob nomes
// estáveis (Icon*) para manter os componentes existentes sem alterações.
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
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
  Columns3,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GitCompareArrows,
  GripVertical,
  Image as ImageIcon,
  Inbox,
  Info,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  Scale,
  Loader2,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Menu,
  Merge,
  Moon,
  Package,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Sun,
  Trash2,
  TrendingUp,
  Trophy,
  Undo2,
  Upload,
  User,
  Users,
  UserX,
  Wallet,
  Wrench,
  X,
  type LucideProps,
} from "lucide-react";

export const IconUpload = Upload;
export const IconMenu = Menu;
export const IconClose = X;
export const IconBuilding = Building2;
export const IconLandmark = Landmark;
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
export const IconSettings = Settings;
export const IconBell = Bell;
export const IconUser = User;
export const IconUserX = UserX;
export const IconTool = Wrench;
export const IconClipboard = ClipboardList;
export const IconDownload = Download;
export const IconDatabase = Database;
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
export const IconLockOpen = LockOpen;
export const IconEye = Eye;
export const IconEyeOff = EyeOff;
export const IconArrowRight = ArrowRight;
export const IconUndo = Undo2;
export const IconArrowUp = ArrowUp;
export const IconArrowDown = ArrowDown;
export const IconTrocar = ArrowLeftRight;
export const IconColunas = Columns3;
export const IconFixar = Pin;
export const IconDesafixar = PinOff;
export const IconCalendar = Calendar;
export const IconGrip = GripVertical;
export const IconRefresh = RefreshCw;
export const IconPlug = Plug;
export const IconInfo = Info;
export const IconLink = Link2;
export const IconScale = Scale;
/** Unificar (juntar itens repetidos num só). */
export const IconMerge = Merge;
/** Comparar lado a lado (DFDs duplicados). */
export const IconCompare = GitCompareArrows;
/** Dashboard de governança da Mesa. */
export const IconDashboard = LayoutDashboard;
/** Copiar o texto de uma célula (nº do protocolo, DFD, código, descrição…). */
export const IconCopy = Copy;

/** Spinner com rotação automática (mantém o comportamento do ícone anterior). */
export function IconSpinner({ className, ...props }: LucideProps) {
  return <Loader2 {...props} className={`animate-spin ${className ?? ""}`} />;
}
