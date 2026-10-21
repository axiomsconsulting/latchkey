import { ChartColumn, SprayCan,
  Bath, BedDouble, Bell, BookOpen, Bot, Building2, CalendarDays, Car, ChartBar, ClipboardList, Coffee, CreditCard, DoorOpen, FileText, Gift,
  Globe, Hammer, Headphones, Heart, HelpCircle, Home, Inbox, Key, LayoutDashboard, LifeBuoy, Link as LinkIcon, MapPin, Megaphone, MessageCircle,
  Leaf, NotebookPen, Package, Phone, Plug, Receipt, Settings, ShieldCheck, ShoppingBag, Sparkles, Star, Sun, Tag, Users, UtensilsCrossed, Wifi, Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** The starter icon set for menu items (lucide), by key. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  sun: Sun, "calendar-days": CalendarDays, wrench: Wrench, "book-open": BookOpen, home: Home, plug: Plug, settings: Settings, "shield-check": ShieldCheck,
  "layout-dashboard": LayoutDashboard, inbox: Inbox, bell: Bell, "message-circle": MessageCircle, phone: Phone, headphones: Headphones, "life-buoy": LifeBuoy,
  "help-circle": HelpCircle, "file-text": FileText, "notebook-pen": NotebookPen, "clipboard-list": ClipboardList, receipt: Receipt, "credit-card": CreditCard,
  "chart-bar": ChartBar, users: Users, "building-2": Building2, "bed-double": BedDouble, bath: Bath, "door-open": DoorOpen, key: Key, wifi: Wifi, car: Car,
  "map-pin": MapPin, coffee: Coffee, "utensils-crossed": UtensilsCrossed, "shopping-bag": ShoppingBag, package: Package, gift: Gift, tag: Tag, star: Star,
  heart: Heart, leaf: Leaf, sparkles: Sparkles, "spray-can": SprayCan, "chart-column": ChartColumn, megaphone: Megaphone, hammer: Hammer, globe: Globe, bot: Bot, link: LinkIcon,
};

/**
 * A menu item's icon: one from the starter set, or an uploaded one. Uploaded
 * icons are tinted like the rest of the menu (their shape used as a mask)
 * unless the super admin asked to keep their own colours.
 */
export function NavIcon({ icon, iconUrl, iconColour, className }: { icon: string; iconUrl?: string | null; iconColour?: boolean; className?: string }) {
  if (iconUrl) {
    return iconColour ? (
      <img src={iconUrl} alt="" aria-hidden className={cn("size-5 shrink-0 object-contain", className)} />
    ) : (
      <span
        aria-hidden
        className={cn("inline-block size-5 shrink-0 bg-current", className)}
        style={{ WebkitMaskImage: `url("${iconUrl}")`, maskImage: `url("${iconUrl}")`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }}
      />
    );
  }
  const Icon = NAV_ICONS[icon] ?? LinkIcon;
  return <Icon aria-hidden className={cn("size-5 shrink-0", className)} />;
}
