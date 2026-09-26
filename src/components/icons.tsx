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
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
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
  Star,
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
  SquareKanban,
  Archive,
  ArchiveRestore,
  Tag,
  Flag,
  StickyNote,
  Globe,
  MessageSquare,
  Send,
  ListChecks,
  Repeat,
  AtSign,
  Zap,
  LayoutTemplate,
  BellRing,
  UserPlus,
  Ellipsis,
  Circle,
  CircleCheck,
  Keyboard,
  MapPin,
  Printer,
  Video,
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
export const IconFixar = Pin;
export const IconDesafixar = PinOff;
export const IconCalendar = Calendar;
export const IconGrip = GripVertical;
export const IconAjuda = CircleHelp;
export const IconEstrela = Star;
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
export const IconKanban = SquareKanban;
export const IconArquivar = Archive;
export const IconDesarquivar = ArchiveRestore;
export const IconEtiqueta = Tag;
export const IconBandeira = Flag;
/** Bloco NOTA da tarefa. */
export const IconNota = StickyNote;
/** Bloco LINK da tarefa (endereço na web). */
export const IconWeb = Globe;
export const IconComentario = MessageSquare;
export const IconEnviar = Send;
export const IconChecklist = ListChecks;
export const IconRepetir = Repeat;
export const IconMencao = AtSign;
export const IconAutomacao = Zap;
export const IconModelo = LayoutTemplate;
export const IconPrazo = BellRing;
export const IconAtribuir = UserPlus;
export const IconMais = Ellipsis;
export const IconCirculo = Circle;
export const IconCirculoCheck = CircleCheck;
export const IconTeclado = Keyboard;
export const IconMapa = MapPin;
export const IconImprimir = Printer;
export const IconVideo = Video;
