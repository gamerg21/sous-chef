// Pure logic behind the report, hide, block and moderation screens.
import type { Author, ModAction, Report } from '@/lib/community-contract'

export const GUIDELINES_URL = 'https://souschefkitchen.app/community-guidelines/'

/** Why a community request failed, read from the local server's fixed messages (src/server/kitchen/communityRemote.ts). */
export type CommunityFailure = 'connect' | 'reconnect' | 'forbidden' | 'busy' | 'unreachable' | 'other'
export function failureKind(message: string): CommunityFailure {
  if (/^Connect your community account/i.test(message)) return 'connect'
  if (/sign-in has expired/i.test(message)) return 'reconnect'
  if (/isn['’]t allowed to do this/i.test(message)) return 'forbidden'
  if (/community is busy/i.test(message)) return 'busy'
  if (/could not be reached|has not connected to a community service/i.test(message)) return 'unreachable'
  return 'other'
}

/** A message safe to show for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const message = error instanceof Error ? error.message.trim() : ''
  return message ? message.slice(0, 300) : fallback
}

/** Characters left, for a counter under a limited field. */
export const remaining = (text: string, limit: number) => limit - text.length

/** "just now", "5 min ago", "3 hr ago", "2 days ago", then a date. */
export function ageLabel(iso: string, now: number): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor(Math.max(0, now - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(then).toLocaleDateString('en', { dateStyle: 'medium' })
}

/** The cook a ban would apply to: whoever wrote the reported content. */
export function banTarget(report: Report): Author | null {
  return report.tip ? report.tip.author : report.recipe?.author ?? null
}

/** What a moderator can do with an open report, in display order. */
export function modActionsFor(report: Report): ModAction[] {
  if (report.status !== 'open') return []
  const actions: ModAction[] = ['dismiss']
  if (report.tip) actions.push('remove_tip')
  if (report.recipe) actions.push('remove_recipe')
  if (banTarget(report)) actions.push('ban_user')
  return actions
}

export const MOD_ACTION_LABELS: Record<ModAction, string> = { dismiss: 'Dismiss', remove_recipe: 'Remove recipe', remove_tip: 'Remove tip', ban_user: 'Ban cook' }

export type ModConfirmation = { title: string; message: string; confirmText: string; danger: boolean }
/** The confirmation for a moderator action: says exactly what will happen. */
export function modConfirmation(report: Report, action: ModAction): ModConfirmation {
  const others = report.reportCount > 1 ? ` All ${report.reportCount} open reports on it are closed.` : ''
  const subject = report.tip ? 'this tip' : report.recipe ? `“${report.recipe.title}”` : 'this content'
  switch (action) {
    case 'dismiss':
      return {
        title: 'Dismiss report?',
        message: `Nothing is removed. ${report.tip ? 'The tip stays visible' : 'The recipe stays published'}${!report.tip && report.recipe?.underReview ? ' and comes back out of review' : ''}.${others || ' The report is closed.'}`,
        confirmText: 'Dismiss report', danger: false,
      }
    case 'remove_tip':
      return {
        title: 'Remove tip?',
        message: `The tip by ${report.tip?.author.name || 'this cook'} is removed for everyone. The recipe stays published.${others}`,
        confirmText: 'Remove tip', danger: true,
      }
    case 'remove_recipe':
      return {
        title: 'Remove recipe?',
        message: `${report.recipe ? `“${report.recipe.title}” by ${report.recipe.author.name || 'this cook'}` : 'The recipe'} is hidden for everyone, for good. Its cook can’t republish it.${others}`,
        confirmText: 'Remove recipe', danger: true,
      }
    case 'ban_user': {
      const cook = banTarget(report)?.name || 'this cook'
      return {
        title: `Ban ${cook}?`,
        message: `${cook} is banned from the community for ${subject}: all their recipes are removed, they can’t publish, and they can’t sign in again.${others}`,
        confirmText: 'Ban cook', danger: true,
      }
    }
  }
}
