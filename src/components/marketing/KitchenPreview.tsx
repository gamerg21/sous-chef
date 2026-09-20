"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChefHat,
  Leaf,
  ShoppingBasket,
  Snowflake,
} from "lucide-react";
import styles from "./landing.module.css";

const views = [
  { id: "pantry", label: "Your pantry", icon: Leaf },
  { id: "cook", label: "What can I cook?", icon: ChefHat },
  { id: "shop", label: "Shopping list", icon: ShoppingBasket },
] as const;
type View = (typeof views)[number]["id"];

/** An illustrative sample: never reads or writes a visitor's kitchen. */
export function KitchenPreview() {
  const [view, setView] = useState<View>("pantry");
  const [checked, setChecked] = useState<string[]>([]);
  return (
    <div className={styles.preview} id="kitchen-preview">
      <div className={styles.previewBar}>
        <span>
          <ChefHat size={19} /> The home kitchen
        </span>
        <span className={styles.sample}>Interactive sample</span>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.previewNav} aria-label="Sample kitchen views">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={view === id ? styles.selected : ""}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
          <div className={styles.previewNote}>
            <BookOpen size={22} />
            <p>
              A little more organized.
              <br />A lot more delicious.
            </p>
          </div>
        </div>
        <div className={styles.previewContent} aria-live="polite">
          {view === "pantry" && (
            <>
              <div className={styles.previewHeading}>
                <div>

                  <h3>Your kitchen, at a glance.</h3>
                </div>
                <span className={styles.roundIcon}>
                  <Leaf size={21} />
                </span>
              </div>
              <div className={styles.locationLabels}>
                <span>All locations</span>
                <span>
                  <Snowflake size={13} /> Fridge
                </span>
                <span>Pantry</span>
                <span>Freezer</span>
              </div>
              <div className={styles.inventoryRow}>
                <span className={styles.foodIcon} aria-hidden="true">
                  🥬
                </span>
                <div>
                  <strong>Baby spinach</strong>
                  <small>Fridge · 150 g</small>
                </div>
                <span className={styles.useSoon}>Use soon</span>
              </div>
              <div className={styles.inventoryRow}>
                <span className={styles.foodIcon} aria-hidden="true">
                  🍋
                </span>
                <div>
                  <strong>Lemons</strong>
                  <small>Fridge · 3 whole</small>
                </div>
                <span className={styles.fresh}>Fresh & ready</span>
              </div>
              <div className={styles.inventoryRow}>
                <span className={styles.foodIcon} aria-hidden="true">
                  🍝
                </span>
                <div>
                  <strong>Pasta</strong>
                  <small>Pantry · 500 g</small>
                </div>
                <span className={styles.fresh}>In stock</span>
              </div>
              <button
                type="button"
                className={styles.previewPrompt}
                onClick={() => setView("cook")}
              >
                <span>
                  <ChefHat size={19} /> Good ingredients. Now, what’s for
                  dinner?
                </span>
                <ArrowRight size={18} />
              </button>
            </>
          )}
          {view === "cook" && (
            <>
              <div className={styles.previewHeading}>
                <div>

                  <h3>Dinner is closer than you think.</h3>
                </div>
              </div>
              <div className={styles.recipeSample}>
                <span className={styles.recipeEmoji} aria-hidden="true">
                  🍋
                </span>
                <div>
                  <h4>Lemon & spinach pasta</h4>
                  <p>25 minutes · 2 servings</p>
                </div>
              </div>
              <div className={styles.ingredientList}>
                <span>
                  <Check size={15} /> Pasta
                </span>
                <span>
                  <Check size={15} /> Spinach
                </span>
                <span>
                  <Check size={15} /> Lemon
                </span>
                <span>+ Parmesan to pick up</span>
              </div>
              <p className={styles.sampleHint}>
                See what you have and what’s missing before you start cooking.
              </p>
              <button
                type="button"
                className={styles.previewPrompt}
                onClick={() => setView("shop")}
              >
                <span>
                  <ShoppingBasket size={19} /> Take the missing ingredient
                  shopping
                </span>
                <ArrowRight size={18} />
              </button>
            </>
          )}
          {view === "shop" && (
            <>
              <div className={styles.previewHeading}>
                <div>

                  <h3>A little list. A better shop.</h3>
                </div>
                <span className={styles.sample}>
                  {checked.length} / 3 picked up
                </span>
              </div>
              {["Parmesan", "Sourdough bread", "Olive oil"].map(
                (item, index) => (
                  <label key={item} className={styles.shoppingRow}>
                    <input
                      type="checkbox"
                      checked={checked.includes(item)}
                      onChange={() =>
                        setChecked((previous) =>
                          previous.includes(item)
                            ? previous.filter((value) => value !== item)
                            : [...previous, item],
                        )
                      }
                    />
                    <span>
                      <strong
                        className={checked.includes(item) ? styles.checked : ""}
                      >
                        {item}
                      </strong>
                      <small>
                        {
                          [
                            "For your lemon & spinach pasta",
                            "1 loaf",
                            "1 bottle",
                          ][index]
                        }
                      </small>
                    </span>
                  </label>
                ),
              )}
              <p className={styles.sampleHint}>
                {checked.length === 3
                  ? "Everything on the sample list is in the basket. Time to head home."
                  : "Try checking off a few things. In your kitchen, you can stock purchases back into inventory."}
              </p>
            </>
          )}
        </div>
      </div>
      <div className={styles.previewFooter}>
        <span className={styles.statusDot} /> A taste of Sous Chef{" "}
        <span>Sample data, made for exploring</span>
      </div>
    </div>
  );
}
