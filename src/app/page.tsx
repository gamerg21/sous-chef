"use client";

import Link from "next/link";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
import { ShoppingListView } from "@/components/cooking/ShoppingListView";
import type { Recipe, PantrySnapshotItem } from "@/components/recipes/types";
import type { InventoryItem, KitchenLocation } from "@/components/inventory/types";
import type { ShoppingListItem } from "@/components/cooking/types";
import { 
  Github, 
  CheckCircle2, 
  Shield, 
  // Server, // Unused import 
  Users, 
  ShoppingCart, 
  ChefHat, 
  Package,
  ArrowRight,
  Sparkles
} from "lucide-react";

// Sample data for showcasing components
const sampleRecipes: Recipe[] = [
  {
    id: "1",
    title: "Classic Chocolate Chip Cookies",
    description: "Soft and chewy cookies with the perfect balance of chocolate",
    totalTimeMinutes: 45,
    servings: 24,
    tags: ["dessert", "baking", "sweet"],
    favorited: true,
    ingredients: [
      { id: "1", name: "All-purpose flour", quantity: 2.25, unit: "cup" },
      { id: "2", name: "Butter", quantity: 1, unit: "cup" },
      { id: "3", name: "Chocolate chips", quantity: 2, unit: "cup" },
    ],
    steps: [],
  },
  {
    id: "2",
    title: "Mediterranean Quinoa Bowl",
    description: "Healthy and flavorful bowl with fresh vegetables and herbs",
    totalTimeMinutes: 30,
    servings: 4,
    tags: ["healthy", "vegetarian", "quick"],
    ingredients: [
      { id: "1", name: "Quinoa", quantity: 1, unit: "cup" },
      { id: "2", name: "Cherry tomatoes", quantity: 1, unit: "cup" },
      { id: "3", name: "Feta cheese", quantity: 0.5, unit: "cup" },
    ],
    steps: [],
  },
];

const samplePantry: PantrySnapshotItem[] = [
  { id: "1", name: "All-purpose flour", quantity: 2, unit: "cup" },
  { id: "2", name: "Butter", quantity: 0.5, unit: "cup" },
  { id: "3", name: "Chocolate chips", quantity: 1, unit: "cup" },
];

const sampleInventory: InventoryItem[] = [
  {
    id: "1",
    name: "Organic Eggs",
    locationId: "fridge",
    quantity: 12,
    unit: "count",
    expiresOn: "2025-01-20",
    category: "Dairy",
  },
  {
    id: "2",
    name: "Fresh Spinach",
    locationId: "fridge",
    quantity: 200,
    unit: "g",
    expiresOn: "2025-01-18",
    category: "Produce",
  },
  {
    id: "3",
    name: "Chicken Breast",
    locationId: "fridge",
    quantity: 500,
    unit: "g",
    expiresOn: "2025-01-19",
    category: "Meat & Seafood",
  },
];

const sampleLocations: KitchenLocation[] = [
  { id: "pantry", name: "Pantry" },
  { id: "fridge", name: "Fridge" },
  { id: "freezer", name: "Freezer" },
];

const sampleShoppingList: ShoppingListItem[] = [
  {
    id: "1",
    name: "Milk",
    quantity: 1,
    unit: "l",
    category: "Dairy",
    checked: false,
    source: "manual",
  },
  {
    id: "2",
    name: "Bread",
    quantity: 1,
    unit: "count",
    category: "Bakery",
    checked: true,
    source: "manual",
  },
  {
    id: "3",
    name: "Bananas",
    quantity: 6,
    unit: "count",
    category: "Produce",
    checked: false,
    source: "manual",
  },
  {
    id: "4",
    name: "Olive Oil",
    quantity: 1,
    unit: "count",
    category: "Pantry",
    checked: false,
    source: "manual",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Navigation */}
      <nav className="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <ChefHat className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xl font-semibold text-stone-900 dark:text-stone-100" style={{ fontFamily: 'var(--font-heading)' }}>
                Sous Chef
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/gamerg21/sous-chef"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-200 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
              <Link
                href="/auth/signin"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              <span>100% Free & Open Source</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-stone-900 dark:text-stone-100 mb-6 leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              Your Personal Kitchen Assistant
            </h1>
            <p className="text-xl sm:text-2xl text-stone-600 dark:text-stone-400 mb-10 leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
              Organize your pantry, manage recipes, and never forget what you need at the store. 
              Self-hosted, privacy-respecting, and built for households.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-emerald-600 text-white text-lg font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
              >
                Start Free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="https://github.com/gamerg21/sous-chef"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-lg border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-lg font-semibold hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors"
              >
                <Github className="w-5 h-5" />
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-stone-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Everything You Need in One Place
            </h2>
            <p className="text-lg text-stone-600 dark:text-stone-400 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-body)' }}>
              From inventory tracking to recipe management, Sous Chef helps you stay organized and reduce food waste.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-6">
              <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Inventory Management
              </h3>
              <p className="text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
                Track pantry, fridge, and freezer items with expiration dates, quantities, and barcode scanning.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-6">
              <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mb-4">
                <ChefHat className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Recipe Library
              </h3>
              <p className="text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
                Store and organize your recipes with ingredient mapping, cooking instructions, and photos.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-6">
              <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mb-4">
                <ShoppingCart className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Smart Shopping Lists
              </h3>
              <p className="text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
                Automatically generate shopping lists from recipes and track what you need at the store.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Component Showcase - Recipes */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-stone-50 dark:bg-stone-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Beautiful Recipe Management
            </h2>
            <p className="text-lg text-stone-600 dark:text-stone-400 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-body)' }}>
              See at a glance which recipes you can cook with what&apos;s in your pantry.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {sampleRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                pantrySnapshot={samplePantry}
                onOpen={() => {}}
                onEdit={() => {}}
                onToggleFavorite={() => {}}
                onDelete={() => {}}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Component Showcase - Inventory */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-stone-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Track Your Kitchen Inventory
            </h2>
            <p className="text-lg text-stone-600 dark:text-stone-400 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-body)' }}>
              Never wonder what&apos;s in your fridge again. Track quantities, expiration dates, and locations.
            </p>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {sampleInventory.map((item) => (
              <InventoryItemRow
                key={item.id}
                item={item}
                location={sampleLocations.find((l) => l.id === item.locationId)}
                onEdit={() => {}}
                onRemove={() => {}}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Component Showcase - Shopping List */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-stone-50 dark:bg-stone-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Smart Shopping Lists
            </h2>
            <p className="text-lg text-stone-600 dark:text-stone-400 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-body)' }}>
              Shared household shopping lists with barcode scanning and automatic categorization.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <ShoppingListView
              items={sampleShoppingList}
              onSearchChange={() => {}}
              onAddItem={() => {}}
              onScanBarcode={() => {}}
              onToggleItem={() => {}}
              onEditItem={() => {}}
              onRemoveItem={() => {}}
              onClearChecked={() => {}}
            />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-stone-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Why Choose Sous Chef?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                100% Free
              </h3>
              <p className="text-stone-600 dark:text-stone-400 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
                No subscriptions, no hidden fees. Use it forever, completely free.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-4">
                <Github className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Open Source
              </h3>
              <p className="text-stone-600 dark:text-stone-400 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
                Licensed under AGPL-3.0. View, modify, and contribute to the code.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Privacy First
              </h3>
              <p className="text-stone-600 dark:text-stone-400 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
                Self-host your data. Your kitchen, your data, your control.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Household Ready
              </h3>
              <p className="text-stone-600 dark:text-stone-400 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
                Built for families and roommates. Share inventory and recipes seamlessly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/20 dark:to-emerald-900/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-stone-100 mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
            Ready to Organize Your Kitchen?
          </h2>
          <p className="text-lg text-stone-600 dark:text-stone-400 mb-10" style={{ fontFamily: 'var(--font-body)' }}>
            Join the community and start managing your kitchen inventory today. It&apos;s free, open source, and ready to use.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-emerald-600 text-white text-lg font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/gamerg21/sous-chef"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-lg font-semibold hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors"
            >
              <Github className="w-5 h-5" />
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <ChefHat className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <span className="text-lg font-semibold text-stone-900 dark:text-stone-100" style={{ fontFamily: 'var(--font-heading)' }}>
                Sous Chef
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/gamerg21/sous-chef"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-600 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-2"
              >
                <Github className="w-5 h-5" />
                <span>GitHub</span>
              </a>
              <Link
                href="/auth/signin"
                className="text-stone-600 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="text-stone-600 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-stone-200 dark:border-stone-800 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-500" style={{ fontFamily: 'var(--font-body)' }}>
              © {new Date().getFullYear()} Sous Chef. Licensed under{" "}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                AGPL-3.0
              </a>
              . Built with ❤️ for the community.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
