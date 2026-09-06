import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Icon>
)

export const ProfilesIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="4.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="14.5" width="7" height="5" rx="2" />
    <rect x="13.5" y="14.5" width="7" height="5" rx="2" />
  </Icon>
)

export const CatalogIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </Icon>
)

export const InstalledIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M4 6h10M4 12h10M4 18h7" />
    <path d="m16.5 16.5 2 2 3.5-4" />
  </Icon>
)

export const AccountIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c1.3-3.2 3.8-4.8 7-4.8s5.7 1.6 7 4.8" />
  </Icon>
)

export const DownloadIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M12 4v10" />
    <path d="m8 10.5 4 4 4-4" />
    <path d="M4.5 19h15" />
  </Icon>
)

export const NewsIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M7 9.5h6M7 13h10M7 16h7" />
  </Icon>
)

export const SettingsIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.14 16.9l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.66 8.8a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.1 4.04l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.04a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1.06z" />
  </Icon>
)

export const LogsIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="m7.5 10 2.5 2-2.5 2" />
    <path d="M12.5 14.5h4" />
  </Icon>
)

export const PlayIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M8 5.5 18.5 12 8 18.5z" fill="currentColor" strokeWidth={1} />
  </Icon>
)

export const StopIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" strokeWidth={1} />
  </Icon>
)

export const FolderIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l1.8 2.2h8a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Icon>
)

export const SearchIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6" />
    <path d="m15.5 15.5 4 4" />
  </Icon>
)

export const PlusIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const ChevronIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)

export const ExternalIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
)

export const CopyIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
  </Icon>
)

export const WarningIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.8" r="0.6" fill="currentColor" />
  </Icon>
)

export const WinMinimizeIcon = (props: SVGProps<SVGSVGElement>): React.ReactElement => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
    <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
  </svg>
)

export const WinMaximizeIcon = (props: SVGProps<SVGSVGElement>): React.ReactElement => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
    <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)

export const WinRestoreIcon = (props: SVGProps<SVGSVGElement>): React.ReactElement => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
    <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    <path d="M2.5 2.5v-2h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)

export const WinCloseIcon = (props: SVGProps<SVGSVGElement>): React.ReactElement => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
    <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
  </svg>
)

export const RayMark = ({ size = 22 }: { size?: number }): React.ReactElement => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2.27 8.41 L9.68 12.35 L9.68 23.00 L2.27 17.67 Z" fill="color-mix(in srgb, var(--accent) 52%, #000)" />
    <path d="M17.09 8.41 L17.09 17.67 L9.68 23.00 L9.68 12.35 Z" fill="color-mix(in srgb, var(--accent) 80%, #000)" />
    <path d="M9.68 4.47 L17.09 8.41 L9.68 12.35 L2.27 8.41 Z" fill="var(--accent)" />
    <path d="M3.61 7.70 L5.68 6.60 L13.09 10.54 L11.02 11.64 Z" fill="color-mix(in srgb, var(--accent) 45%, #fff)" />
    <path d="M15.24 2.74 L18.48 4.47 L18.48 8.87 L15.24 6.67 Z" fill="color-mix(in srgb, var(--accent) 72%, #000)" />
    <path d="M21.73 2.74 L21.73 6.67 L18.48 8.87 L18.48 4.47 Z" fill="var(--accent)" />
    <path d="M18.48 1.00 L21.73 2.74 L18.48 4.47 L15.24 2.74 Z" fill="color-mix(in srgb, var(--accent) 40%, #fff)" />
  </svg>
)

export const RayLogo = ({ size = 20 }: { size?: number }): React.ReactElement => (
  <span className="inline-flex items-center gap-2">
    <RayMark size={size} />
    <span
      className="font-semibold tracking-[-0.01em] text-ink"
      style={{ fontSize: `${Math.round(size * 0.72)}px` }}
    >
      Ray<span className="text-accent">Launcher</span>
    </span>
  </span>
)

export const CheckIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
)

export const TrashIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </Icon>
)

export const RefreshIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 0 0-13.6-4.9L4 8.4" />
    <path d="M4 4v4.5h4.5" />
    <path d="M4 13a8 8 0 0 0 13.6 4.9L20 15.6" />
    <path d="M20 20v-4.5h-4.5" />
  </Icon>
)

export const PackageIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <path d="M12 3.5 20 8v8l-8 4.5L4 16V8z" />
    <path d="M4 8l8 4.5L20 8" />
    <path d="M12 12.5V21" />
  </Icon>
)

export const KeyIcon = (props: IconProps): React.ReactElement => (
  <Icon {...props}>
    <circle cx="8" cy="12" r="3.5" />
    <path d="M11.5 12H21" />
    <path d="M17.5 12v3" />
    <path d="M20 12v2" />
  </Icon>
)
