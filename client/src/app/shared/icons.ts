import {
  Banknote,
  Bike,
  ChefHat,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Clock,
  Coins,
  Crosshair,
  Dices,
  Flag,
  HandCoins,
  Hash,
  House,
  Inbox,
  Info,
  KeyRound,
  Layers,
  Lightbulb,
  LocateFixed,
  Lock,
  LogIn,
  LogOut,
  LucideIconData,
  Map as MapIcon,
  MapPin,
  MapPinned,
  Navigation,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  User,
  UserRound,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
  Zap,
} from 'lucide-angular';

/**
 * ไอคอนทั้งหมดที่ใช้ในแอป (Lucide) รวมไว้ที่เดียว
 * ใช้ใน html:  <lucide-icon [img]="icons.map" [size]="18"></lucide-icon>
 */
export const APP_ICONS = {
  banknote: Banknote,
  bike: Bike,
  chefHat: ChefHat,
  chevronRight: ChevronRight,
  alert: CircleAlert,
  check: CircleCheck,
  clipboard: ClipboardList,
  clock: Clock,
  coins: Coins,
  crosshair: Crosshair,
  dices: Dices,
  flag: Flag,
  handCoins: HandCoins,
  hash: Hash,
  house: House,
  inbox: Inbox,
  info: Info,
  key: KeyRound,
  layers: Layers,
  lightbulb: Lightbulb,
  locate: LocateFixed,
  lock: Lock,
  logIn: LogIn,
  logOut: LogOut,
  map: MapIcon,
  mapPin: MapPin,
  mapPinned: MapPinned,
  navigation: Navigation,
  package: Package,
  pencil: Pencil,
  phone: Phone,
  plus: Plus,
  receipt: Receipt,
  refresh: RefreshCw,
  route: Route,
  search: Search,
  shield: ShieldCheck,
  smartphone: Smartphone,
  store: Store,
  timer: Timer,
  trash: Trash2,
  trendingUp: TrendingUp,
  warning: TriangleAlert,
  user: User,
  userRound: UserRound,
  users: Users,
  utensils: UtensilsCrossed,
  wallet: Wallet,
  x: X,
  zap: Zap,
};

export type AppIcons = typeof APP_ICONS;

/**
 * แปลงไอคอน Lucide เป็น SVG string
 * ใช้กับหมุดบนแผนที่ Leaflet (divIcon รับได้แค่ html string ใช้ component ไม่ได้)
 */
export function iconSvg(icon: LucideIconData, size = 16, color = 'currentColor', strokeWidth = 2.2): string {
  const children = icon
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}></${tag}>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
  );
}

/** ป้องกันข้อความจากผู้ใช้ไปแทรก HTML ใน popup ของแผนที่ */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
