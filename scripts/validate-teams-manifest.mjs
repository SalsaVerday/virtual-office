/**
 * Checks a Teams app manifest against the 1.19 rules this package uses.
 * Schema: https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json
 */
const GUID = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/
const SEMVER = /^([0-9]|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)$/
const HEX = /^#[0-9a-fA-F]{6}$/
const HTTPS = /^[Hh][Tt][Tt][Pp][Ss]?:\/\//

export function validateTeamsManifest(manifest) {
  const errors = []
  const need = (ok, message) => {
    if (!ok) errors.push(message)
  }
  need(manifest && typeof manifest === 'object', 'manifest must be an object')
  if (!manifest || typeof manifest !== 'object') return errors
  need(manifest.manifestVersion === '1.19', 'manifestVersion must be 1.19')
  need(typeof manifest.version === 'string' && SEMVER.test(manifest.version), 'version must be major.minor.patch')
  need(typeof manifest.id === 'string' && GUID.test(manifest.id), 'id must be a GUID')
  const developer = manifest.developer || {}
  need(typeof developer.name === 'string' && developer.name.length > 0 && developer.name.length <= 32, 'developer.name is required (max 32)')
  for (const key of ['websiteUrl', 'privacyUrl', 'termsOfUseUrl']) {
    need(typeof developer[key] === 'string' && HTTPS.test(developer[key]), `developer.${key} must be an http(s) URL`)
  }
  need(typeof manifest.name?.short === 'string' && manifest.name.short.length <= 30, 'name.short is required (max 30)')
  need(typeof manifest.name?.full === 'string' && manifest.name.full.length <= 100, 'name.full is required (max 100)')
  need(typeof manifest.description?.short === 'string' && manifest.description.short.length <= 80, 'description.short is required (max 80)')
  need(typeof manifest.description?.full === 'string' && manifest.description.full.length > 0, 'description.full is required')
  need(manifest.icons?.color === 'color.png', 'icons.color must be color.png')
  need(manifest.icons?.outline === 'outline.png', 'icons.outline must be outline.png')
  need(typeof manifest.accentColor === 'string' && HEX.test(manifest.accentColor), 'accentColor must be #RRGGBB')
  const tab = Array.isArray(manifest.staticTabs) ? manifest.staticTabs[0] : null
  need(tab?.entityId === 'join-standup', 'static tab entityId must be join-standup')
  need(tab?.name === 'Join standup', 'static tab name must be Join standup')
  need(typeof tab?.contentUrl === 'string' && tab.contentUrl.startsWith('https://') && tab.contentUrl.includes('zone=standup'), 'contentUrl must be https and include zone=standup')
  need(typeof tab?.websiteUrl === 'string' && tab.websiteUrl.startsWith('https://') && tab.websiteUrl.includes('zone=standup'), 'websiteUrl must be the same standup deep link')
  need(Array.isArray(tab?.scopes) && tab.scopes.includes('personal'), 'static tab scopes must include personal')
  let host = ''
  try {
    host = new URL(tab.contentUrl).hostname
  } catch {
    host = ''
  }
  need(Array.isArray(manifest.validDomains) && host && manifest.validDomains.includes(host), 'validDomains must include the contentUrl host')
  need(!JSON.stringify(manifest).includes('STAGING_URL'), 'STAGING_URL placeholder is still in the manifest')
  return errors
}
