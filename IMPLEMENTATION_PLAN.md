# Sous Chef Implementation Plan

## Overview

This document outlines the comprehensive implementation plan for Sous Chef, an open-source, self-hostable personal kitchen assistant.

## Technical Decisions

### Authentication & Authorization
- **Method**: Email magic links (already implemented via NextAuth)
- **Roles**: Household roles (owner, admin, member) with permission-based access
- **Admin Interface**: Yes - for moderation and system management

### User & Account Modeling
- **Multi-user**: Yes - household-based collaboration
- **Household Management**:
  - Auto-create household on signup
  - Invite system for adding members
  - Household switcher in sidebar navigation (for users in multiple households)
- **User Preferences**: 
  - Default measurement system (metric/imperial)
  - Default units for different contexts
  - Timezone, date format, language (future)

### Tech Stack
- **Framework**: Next.js 16.1.0 with App Router
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **File Storage**: Supabase Storage
- **Styling**: Tailwind CSS 4 with design system tokens
- **Real-time**: Server-Sent Events (SSE) for real-time updates (moderate complexity, good for self-hosted)

### Backend Business Logic
- **Barcode Scanning**: OpenFoodFacts API integration
- **Recipe Import**: RecipeML standard support
- **Real-time Updates**: SSE for inventory/shopping list changes
- **Notifications**: In-app notifications system
- **Background Jobs**: Scheduled tasks for expired item detection (using Next.js API routes with cron or similar)

### Additional Features
- **Feature Flags**: Community & Extensions section will be feature-flag controlled
- **AI Integration**: Deferred to later milestones
- **Testing**: Framework-agnostic (will set up based on project needs)
- **Design System**: Strict adherence to provided design tokens and components

## Implementation Phases

### Phase 1: Foundation (Milestone 1)
**Goal**: Set up design tokens, data model types, routing structure, and application shell

**Tasks**:
1. Configure design tokens (CSS custom properties, Tailwind config, Google Fonts)
2. Extend Prisma schema with all core entities:
   - FoodItem, Barcode, KitchenLocation
   - InventoryItem, MediaAsset
   - Recipe, RecipeIngredient, RecipeStep
   - ShoppingList, ShoppingListItem
   - UserPreferences model
3. Create TypeScript types matching data model
4. Set up routing structure for all sections
5. Integrate shell components (AppShell, MainNav, UserMenu)
6. Add household switcher to navigation
7. Implement user preferences storage
8. Set up Supabase Storage configuration

**Deliverables**:
- Design tokens configured
- Complete Prisma schema with migrations
- TypeScript types defined
- All routes created (placeholder pages)
- Shell rendering with navigation
- Household switcher functional

### Phase 2: Kitchen Inventory (Milestone 2)
**Goal**: Shared pantry/fridge/freezer tracking with quantities, expirations, photos, and scanning

**Tasks**:
1. Copy and integrate Kitchen Inventory components
2. Create API endpoints:
   - GET /api/inventory - List inventory items
   - POST /api/inventory - Create inventory item
   - PATCH /api/inventory/[id] - Update inventory item
   - DELETE /api/inventory/[id] - Remove inventory item
3. Implement barcode scanning integration (OpenFoodFacts API)
4. Set up photo upload to Supabase Storage
5. Wire up all component callbacks
6. Implement filtering and search
7. Add empty states
8. Set up real-time updates via SSE

**Deliverables**:
- Full CRUD for inventory items
- Barcode scanning functional
- Photo uploads working
- Real-time sync across household members
- All user flows working end-to-end

### Phase 3: Recipes (Milestone 3)
**Goal**: Private recipe library with ingredient-to-inventory mapping and import/export

**Tasks**:
1. Copy and integrate Recipe components
2. Create API endpoints:
   - GET /api/recipes - List recipes
   - POST /api/recipes - Create recipe
   - GET /api/recipes/[id] - Get recipe detail
   - PATCH /api/recipes/[id] - Update recipe
   - DELETE /api/recipes/[id] - Delete recipe
   - POST /api/recipes/import - Import recipe (RecipeML)
   - GET /api/recipes/[id]/export - Export recipe
3. Implement RecipeML parser
4. Implement ingredient-to-inventory mapping logic
5. Wire up all component callbacks
6. Add empty states
7. Implement recipe photo uploads

**Deliverables**:
- Full CRUD for recipes
- RecipeML import working
- Ingredient mapping functional
- Export functionality working
- All user flows working end-to-end

### Phase 4: Cooking & Shopping (Milestone 4)
**Goal**: "What can I cook?" discovery plus "Cook recipe" flow

**Tasks**:
1. Copy and integrate Cooking & Shopping components
2. Implement cookability matching algorithm:
   - Compare recipe ingredients to inventory
   - Calculate match percentage
   - Identify missing ingredients
3. Create API endpoints:
   - GET /api/cooking/what-can-i-cook - Get cookable recipes
   - POST /api/cooking/cook-recipe - Execute cook flow (deduct inventory, add missing to shopping list)
   - GET /api/shopping-list - Get shopping list
   - POST /api/shopping-list/items - Add item to shopping list
   - PATCH /api/shopping-list/items/[id] - Update shopping list item
   - DELETE /api/shopping-list/items/[id] - Remove item
4. Wire up all component callbacks
5. Add empty states
6. Set up real-time updates for shopping list

**Deliverables**:
- Cookability matching working correctly
- Cook recipe flow deducts inventory properly
- Missing ingredients added to shopping list
- Shopping list CRUD operations working
- All user flows working end-to-end

### Phase 5: Shopping List (Milestone 5)
**Goal**: Shared household shopping list with quick add, barcode scan, and fast check-off

**Tasks**:
1. Enhance shopping list components (may share with Milestone 4)
2. Implement category grouping and sorting
3. Add barcode scanning for shopping list items
4. Implement "clear checked items" functionality
5. Wire up all component callbacks
6. Add empty states
7. Ensure real-time sync

**Deliverables**:
- Shopping list fully functional
- Barcode scanning for adding items
- Category grouping working
- All user flows working end-to-end

### Phase 6: Community & Extensions (Milestone 6)
**Goal**: Optional community recipe discovery and publishing, plus extension marketplace

**Tasks**:
1. Add feature flag for Community & Extensions
2. Copy and integrate Community components
3. Create API endpoints:
   - GET /api/community/recipes - Browse community recipes
   - POST /api/community/recipes - Publish recipe
   - POST /api/community/recipes/[id]/save - Save to private library
   - GET /api/extensions - Browse extensions
   - POST /api/extensions/[id]/install - Install extension
4. Implement recipe publishing flow
5. Implement extension marketplace (basic)
6. Wire up all component callbacks
7. Add moderation entry points

**Deliverables**:
- Community recipe browsing working
- Recipe publishing functional
- Extension marketplace (basic implementation)
- Feature flag controls access

## Database Schema Extensions

### New Models to Add

```prisma
model FoodItem {
  id            String   @id @default(cuid())
  name          String
  canonicalName String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  barcodes      Barcode[]
  inventoryItems InventoryItem[]
  recipeIngredients RecipeIngredient[]
  shoppingListItems ShoppingListItem[]
}

model Barcode {
  id         String   @id @default(cuid())
  foodItemId String
  code       String   // UPC/EAN
  type       String   // 'UPC' | 'EAN'
  createdAt  DateTime @default(now())
  
  foodItem   FoodItem @relation(fields: [foodItemId], references: [id], onDelete: Cascade)
  
  @@unique([code])
  @@index([foodItemId])
}

model KitchenLocation {
  id          String   @id @default(cuid())
  householdId String
  name        String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  household      Household      @relation(fields: [householdId], references: [id], onDelete: Cascade)
  inventoryItems InventoryItem[]
  
  @@index([householdId])
}

model InventoryItem {
  id          String   @id @default(cuid())
  householdId String
  foodItemId  String
  locationId  String
  quantity    Float
  unit        String
  expiresOn   DateTime?
  category    String?
  notes       String?
  photoUrl    String?
  barcode     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  household    Household      @relation(fields: [householdId], references: [id], onDelete: Cascade)
  foodItem     FoodItem       @relation(fields: [foodItemId], references: [id])
  location     KitchenLocation @relation(fields: [locationId], references: [id])
  
  @@index([householdId])
  @@index([locationId])
  @@index([foodItemId])
}

model MediaAsset {
  id              String   @id @default(cuid())
  url             String
  recipeId        String?
  inventoryItemId String?
  uploadedAt      DateTime @default(now())
  
  recipe         Recipe?         @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  inventoryItem  InventoryItem?  @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  
  @@index([recipeId])
  @@index([inventoryItemId])
}

model Recipe {
  id              String   @id @default(cuid())
  householdId     String
  title           String
  description     String?
  photoUrl        String?
  tags            String[]
  visibility      String   @default("private") // 'private' | 'household' | 'public' | 'unlisted'
  servings        Int?
  totalTimeMinutes Int?
  sourceUrl       String?
  notes           String?
  favorited       Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastCookedAt    DateTime?
  
  household          Household          @relation(fields: [householdId], references: [id], onDelete: Cascade)
  ingredients        RecipeIngredient[]
  steps              RecipeStep[]
  mediaAssets        MediaAsset[]
  shoppingListItems  ShoppingListItem[]
  
  @@index([householdId])
  @@index([visibility])
}

model RecipeIngredient {
  id              String   @id @default(cuid())
  recipeId        String
  foodItemId      String?
  name            String
  quantity        Float?
  unit            String?
  note            String?
  order           Int
  createdAt       DateTime @default(now())
  
  recipe    Recipe    @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  foodItem  FoodItem? @relation(fields: [foodItemId], references: [id])
  
  @@index([recipeId])
  @@index([foodItemId])
}

model RecipeStep {
  id        String   @id @default(cuid())
  recipeId  String
  text      String   @db.Text
  order     Int
  createdAt DateTime @default(now())
  
  recipe Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  
  @@index([recipeId])
}

model ShoppingList {
  id          String   @id @default(cuid())
  householdId String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  household Household        @relation(fields: [householdId], references: [id], onDelete: Cascade)
  items     ShoppingListItem[]
}

model ShoppingListItem {
  id            String   @id @default(cuid())
  shoppingListId String
  foodItemId    String?
  name          String
  quantity      Float?
  unit          String?
  category      String?
  checked       Boolean  @default(false)
  note          String?
  source        String?  // 'manual' | 'from-recipe' | 'low-stock'
  recipeId      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  shoppingList ShoppingList @relation(fields: [shoppingListId], references: [id], onDelete: Cascade)
  foodItem     FoodItem?    @relation(fields: [foodItemId], references: [id])
  recipe       Recipe?      @relation(fields: [recipeId], references: [id], onDelete: SetNull)
  
  @@index([shoppingListId])
  @@index([foodItemId])
}

model UserPreferences {
  id                String   @id @default(cuid())
  userId            String   @unique
  measurementSystem String   @default("metric") // 'metric' | 'imperial'
  defaultWeightUnit String   @default("g")      // 'g' | 'kg' | 'oz' | 'lb'
  defaultVolumeUnit String   @default("ml")     // 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp'
  timezone          String?
  dateFormat        String?  @default("YYYY-MM-DD")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// Update Household model
model Household {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members        HouseholdMember[]
  locations     KitchenLocation[]
  inventoryItems InventoryItem[]
  recipes        Recipe[]
  shoppingList   ShoppingList?
}
```

## Real-time Updates Implementation

**Approach**: Server-Sent Events (SSE)

**Why SSE?**
- Simpler than WebSockets for one-way updates
- Works well with Next.js API routes
- Good for self-hosted deployments
- Automatic reconnection handling

**Implementation**:
- Create `/api/events` endpoint for SSE connections
- Subscribe to household-specific events
- Broadcast updates when inventory/shopping list changes
- Client reconnects automatically on disconnect

## Background Jobs

**Approach**: Next.js API route with external cron trigger or internal scheduler

**Jobs Needed**:
1. **Expired Items Check**: Daily job to mark/notify about expiring items
2. **Cleanup**: Periodic cleanup of old verification tokens, expired sessions

**Implementation Options**:
- External cron service (cron-job.org, GitHub Actions)
- Internal scheduler using `node-cron` or similar
- Database triggers for immediate checks

## File Storage (Supabase)

**Setup**:
1. Configure Supabase Storage buckets:
   - `inventory-photos` - for inventory item photos
   - `recipe-photos` - for recipe photos
2. Set up upload API endpoints with proper authentication
3. Implement image optimization/resizing
4. Handle file deletion when items are removed

## Open Source Considerations

1. **Environment Variables**: All sensitive config via env vars
2. **Documentation**: Comprehensive README with setup instructions
3. **Docker Support**: Docker Compose for easy self-hosting
4. **License**: Ensure appropriate open source license
5. **No Hardcoded Secrets**: All external services configurable
6. **Database Migrations**: Versioned, reversible migrations

## Next Steps

1. Start with Phase 1 (Foundation)
2. Implement incrementally, testing each phase
3. Set up testing framework as needed
4. Document as we go
5. Ensure self-host friendly at each step
