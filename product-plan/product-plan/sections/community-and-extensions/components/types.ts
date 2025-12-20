export type CommunityRecipeId = string

export type IngredientUnit =
  | 'count'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'ml'
  | 'l'
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'pinch'

export interface CommunityAuthor {
  id: string
  name: string
  avatarUrl?: string
}

export interface CommunityRecipeIngredient {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit
  note?: string
}

export interface CommunityRecipeStep {
  id: string
  text: string
}

export interface CommunityRecipe {
  id: CommunityRecipeId
  title: string
  description?: string
  photoUrl?: string
  tags?: string[]
  servings?: number
  totalTimeMinutes?: number
  sourceUrl?: string
  ingredients: CommunityRecipeIngredient[]
  steps: CommunityRecipeStep[]
  author: CommunityAuthor
  likes?: number
  savedCount?: number
  createdAt?: string
}

export interface CommunitySampleData {
  recipes: CommunityRecipe[]
  suggestedTags?: string[]
}

export type ExtensionId = string
export type IntegrationId = string

export type ExtensionPricing = 'free' | 'paid' | 'trial'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error'
export type AiKeyMode = 'bring-your-own'

export interface ExtensionAuthor {
  name: string
  verified?: boolean
  url?: string
}

export interface ExtensionListing {
  id: ExtensionId
  name: string
  description: string
  category: string
  tags?: string[]
  author: ExtensionAuthor
  pricing: ExtensionPricing
  rating?: number
  installs?: number
  updatedAt?: string
  permissions?: string[]
}

export interface InstalledExtension {
  extensionId: ExtensionId
  enabled: boolean
  needsConfiguration?: boolean
}

export interface Integration {
  id: IntegrationId
  name: string
  description: string
  status: IntegrationStatus
  scopes?: string[]
  lastSyncAt?: string
}

export interface AiProvider {
  id: string
  name: string
  recommendedModel?: string
  availableByok?: boolean
  status?: 'ready' | 'needs-key' | 'error'
}

export interface AiSettings {
  keyMode: AiKeyMode
  providers: AiProvider[]
  activeProviderId?: string
}

export interface CommunityRecipeListing {
  id: CommunityRecipeId
  title: string
  authorName: string
  description?: string
  tags?: string[]
  totalTimeMinutes?: number
  rating?: number
  saves?: number
  visibility?: 'public' | 'unlisted'
}

export interface CommunityAndExtensionsSampleData {
  categories: string[]
  featuredRecipes: CommunityRecipeListing[]
  extensions: ExtensionListing[]
  installedExtensions: InstalledExtension[]
  integrations: Integration[]
  ai: AiSettings
}


