/** Frames in assets/ui/status_icons.png: 0 online, 1 away, 2 focus, 3 talking, 4 knock. */
export function StatusIcon({
  frame,
  small = false,
  testId,
}: {
  frame: number
  small?: boolean
  testId?: string
}) {
  const index = Math.max(0, Math.min(4, frame))
  return <span className={small ? `icon sm icon-${index}` : `icon icon-${index}`} data-testid={testId} aria-hidden="true" />
}

export const STATUS_FRAME = {
  online: 0,
  away: 1,
  focus: 2,
  talking: 3,
  knock: 4,
} as const
