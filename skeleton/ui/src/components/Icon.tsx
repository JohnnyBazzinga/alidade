// The UI's icons (Req 20.7, 22.8, design D37.6): a closed list of names, each drawn from
// lucide-react (ISC, 1.70.0), the one icon source of the repository. An application gets icons
// through `Icon` and does not list the package. An icon is decorative: it always stands beside
// visible text that says the same, it is hidden from assistive technology, and its colour is the
// text's (`currentColor`), so that it takes the role of the words beside it.

import type { CSSProperties } from 'react';
import {
  Binoculars,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock,
  Cloud,
  Compass,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Inbox,
  Info,
  Lightbulb,
  Link,
  List,
  ListChecks,
  Map as MapIcon,
  MapPin,
  MapPinned,
  Navigation,
  OctagonAlert,
  Phone,
  Plus,
  QrCode,
  Send,
  Share2,
  ShieldAlert,
  Siren,
  Smartphone,
  Trash2,
  TriangleAlert,
  Vibrate,
  Video,
  type LucideIcon,
} from 'lucide-react';

/** Each name of the closed list and the lucide component that draws it (D37.6). */
const ICONS = {
  smoke: Cloud,
  call: Phone,
  plus: Plus,
  sightings: List,
  map: MapIcon,
  siren: Siren,
  shield: ShieldAlert,
  binoculars: Binoculars,
  compass: Compass,
  crosshair: Crosshair,
  pin: MapPin,
  pins: MapPinned,
  info: Info,
  lightbulb: Lightbulb,
  warning: TriangleAlert,
  danger: OctagonAlert,
  success: CircleCheck,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  camera: Camera,
  video: Video,
  hide: EyeOff,
  show: Eye,
  share: Share2,
  send: Send,
  trash: Trash2,
  clock: Clock,
  navigation: Navigation,
  vibrate: Vibrate,
  inbox: Inbox,
  qr: QrCode,
  link: Link,
  check: Check,
  steps: ListChecks,
  phone: Smartphone,
  copy: Copy,
} as const satisfies Readonly<Record<string, LucideIcon>>;

export type IconName = keyof typeof ICONS;

/** The closed list of names (Req 22.8). */
export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[];

/** The lucide component of each name, by its exported name: what the test checks against D37.6. */
export const ICON_COMPONENT_NAMES: Readonly<Record<IconName, string>> = {
  smoke: 'Cloud',
  call: 'Phone',
  plus: 'Plus',
  sightings: 'List',
  map: 'Map',
  siren: 'Siren',
  shield: 'ShieldAlert',
  binoculars: 'Binoculars',
  compass: 'Compass',
  crosshair: 'Crosshair',
  pin: 'MapPin',
  pins: 'MapPinned',
  info: 'Info',
  lightbulb: 'Lightbulb',
  warning: 'TriangleAlert',
  danger: 'OctagonAlert',
  success: 'CircleCheck',
  'chevron-left': 'ChevronLeft',
  'chevron-right': 'ChevronRight',
  'chevron-down': 'ChevronDown',
  'chevron-up': 'ChevronUp',
  camera: 'Camera',
  video: 'Video',
  hide: 'EyeOff',
  show: 'Eye',
  share: 'Share2',
  send: 'Send',
  trash: 'Trash2',
  clock: 'Clock',
  navigation: 'Navigation',
  vibrate: 'Vibrate',
  inbox: 'Inbox',
  qr: 'QrCode',
  link: 'Link',
  check: 'Check',
  steps: 'ListChecks',
  phone: 'Smartphone',
  copy: 'Copy',
};

/** The icon's size and stroke (Req 22.8). */
export const ICON_SIZE_PX = 24;
export const ICON_STROKE_PX = 2;

export interface IconProps {
  readonly name: IconName;
  /** Layout only (a margin, an alignment); the colour is the text's, through `currentColor`. */
  readonly style?: CSSProperties;
}

export function Icon({ name, style }: IconProps) {
  const Drawn: LucideIcon | undefined = (ICONS as Readonly<Record<string, LucideIcon>>)[name];
  if (Drawn === undefined) return null;
  return (
    <Drawn
      size={ICON_SIZE_PX}
      strokeWidth={ICON_STROKE_PX}
      color="currentColor"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
