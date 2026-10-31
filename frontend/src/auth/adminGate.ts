/**
 * Who can open /admin.
 *
 * Today dev and staging have no `users` row, so `isAdmin` is null and
 * `VITE_ADMIN=true` is the gate. When Azure sign-in loads a profile, pass
 * `users.is_admin` as `isAdmin`. A known false denies the page even if the
 * dev flag is still set. A known true allows it. The office HUD never links here.
 */
export function canViewAdmin(input: { devFlag: boolean; isAdmin: boolean | null }): boolean {
  if (input.isAdmin === true) return true
  if (input.isAdmin === false) return false
  return input.devFlag
}
