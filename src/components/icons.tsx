// Ícones do sistema — biblioteca padrão (lucide-react), reexportados sob nomes
// estáveis (Icon*) para manter os componentes existentes sem alterações.
import type { SVGProps } from "react";
import {
  Activity,
  BadgeCheck,
  Briefcase,
  IdCard,
  MailCheck,
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
  Folder,
  FolderOpen,
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
  Bold,
  Italic,
  Heading,
  List,
  SlidersHorizontal,
  ListOrdered,
  Quote,
  Code,
  Hourglass,
  AlignLeft,
  SquarePlus,
  Move,
  ZoomIn,
  FoldHorizontal,
  UnfoldHorizontal,
  WrapText,
  Ban,
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
/** E-mail CONFIRMADO / código enviado ao e-mail. */
export const IconMailCheck = MailCheck;
/** Matrícula (identificação funcional). */
export const IconIdCard = IdCard;
/** Cargo ou função. */
export const IconBriefcase = Briefcase;
/** Dado VERIFICADO (e-mail institucional confirmado). */
export const IconBadgeCheck = BadgeCheck;
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
export const IconPasta = Folder;
export const IconPastaAberta = FolderOpen;
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
/** Cartão com "+" (criar a partir de TEMPLATE — o ícone do pé da lista, como no Trello). */
export const IconCartaoMais = SquarePlus;
/** Mover/arrastar (enquadrar a imagem de fundo). */
export const IconMove = Move;
/** Zoom (aproximar a imagem de fundo). */
export const IconZoom = ZoomIn;
/** Recolher / expandir uma lista do quadro (como no Trello). */
export const IconRecolher = FoldHorizontal;
export const IconExpandir = UnfoldHorizontal;
/** Dados COMPLETOS nas células (texto inteiro, todas as linhas) — o alternador da Mesa. */
export const IconTextoCompleto = WrapText;
/** "Nenhum" (sem fundo — o padrão do sistema). */
export const IconNenhum = Ban;
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
export const IconBold = Bold;
export const IconItalic = Italic;
export const IconHeading = Heading;
export const IconList = List;
export const IconListOrdered = ListOrdered;
export const IconQuote = Quote;
export const IconCode = Code;
export const IconEstimativa = Hourglass;
export const IconDescricao = AlignLeft;
/** CAMPOS PERSONALIZADOS da tarefa. */
export const IconCampos = SlidersHorizontal;

/** O GOOGLE (o "G" da marca, monocromático — segue a cor do texto). */
export function IconGoogle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.82h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.33Z" />
      <path d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22Z" />
      <path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96L6.4 13.9Z" />
      <path d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z" />
    </svg>
  );
}

/** O TRELLO (a marca: o quadro com duas colunas) — no traço dos ícones do lucide. */
export function IconTrello(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <rect x="7" y="7" width="3.5" height="9" rx="0.8" />
      <rect x="13.5" y="7" width="3.5" height="5.5" rx="0.8" />
    </svg>
  );
}
