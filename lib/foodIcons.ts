import { detectItem } from "@/lib/keywordDetect";

/** One icon per knowledge-base category (see EXPIRY_KNOWLEDGE). */
export const CATEGORY_ICONS: Record<string, string> = {
  fruit: "🍎",
  vegetable: "🥕",
  herb: "🌿",
  dairy: "🥛",
  meat: "🥩",
  poultry: "🍗",
  seafood: "🐟",
  deli: "🥓",
  bakery: "🍞",
  grain: "🌾",
  pantry: "🥫",
  frozen: "🧊",
  snack: "🍿",
  beverage: "🧃",
  condiment: "🧂",
  sauce: "🫙",
  spread: "🍯",
  spice: "🌶️",
  oil: "🫒",
  nut: "🥜",
  leftovers: "🍱",
  baby: "🍼",
  pet: "🐾",
  "plant-based": "🌱",
};

export const DEFAULT_ICON = "🛒";

/** Specific foods whose icon beats their category's (a banana shouldn't show an apple). */
const FOOD_ICONS: Record<string, string> = {
  apple: "🍎",
  avocado: "🥑",
  banana: "🍌",
  blueberry: "🫐",
  strawberry: "🍓",
  grape: "🍇",
  watermelon: "🍉",
  pineapple: "🍍",
  mango: "🥭",
  peach: "🍑",
  cherry: "🍒",
  lemon: "🍋",
  orange: "🍊",
  tangerine: "🍊",
  kiwi: "🥝",
  pear: "🍐",
  coconut: "🥥",
  carrot: "🥕",
  broccoli: "🥦",
  lettuce: "🥬",
  spinach: "🥬",
  kale: "🥬",
  cucumber: "🥒",
  "bell pepper": "🫑",
  onion: "🧅",
  garlic: "🧄",
  potato: "🥔",
  "sweet potato": "🍠",
  tomato: "🍅",
  mushroom: "🍄",
  corn: "🌽",
  eggplant: "🍆",
  eggs: "🥚",
  butter: "🧈",
  bread: "🍞",
  pasta: "🍝",
  shrimp: "🍤",
  bacon: "🥓",
  "ice cream": "🍨",
  honey: "🍯",
  wine: "🍷",
  beer: "🍺",
};

/** Word patterns for food families the knowledge base splits into many entries ("cheddar cheese", "white rice"). First match wins. */
const FAMILY_ICONS: [RegExp, string][] = [
  [/\bwine\b/, "🍷"],
  [/\bcheesecake\b/, "🍰"],
  [/\bcheese\b/, "🧀"],
  [/\brice\b/, "🍚"],
  [/\bpizza\b/, "🍕"],
  [/\bbagels?\b/, "🥯"],
  [/\bcroissants?\b/, "🥐"],
  [/\bchocolate\b/, "🍫"],
  [/\bcookies?\b/, "🍪"],
  [/\bcoffee\b/, "☕"],
  [/\btea\b/, "🍵"],
  [/\begg\b/, "🥚"],
];

/** Picker-only extras that no single knowledge-base entry maps to. */
const EXTRA_CHOICES = ["🥯", "🥐", "🍕", "🍫", "🍪", "☕", "🍵", "🧀", "🍚", "🍰", "🥗", "🥪", "🌮", "🍜", "🥤", "🧁"];

/** Curated picker grid: the category icons plus common foods, deduplicated, in a stable order. */
export const ICON_CHOICES: string[] = Array.from(
  new Set([...Object.values(FOOD_ICONS), ...EXTRA_CHOICES, ...Object.values(CATEGORY_ICONS), DEFAULT_ICON])
);

export function categoryIcon(category: string | null | undefined): string {
  return (category && CATEGORY_ICONS[category]) || DEFAULT_ICON;
}

/** Icon for a name the user typed: the specific food if known, else its category's, else a cart. */
export function suggestIcon(name: string, category?: string | null): string {
  const detected = detectItem(name);
  if (detected) {
    const exact = FOOD_ICONS[detected.name];
    if (exact) return exact;
    const family = FAMILY_ICONS.find(([pattern]) => pattern.test(detected.name));
    return family ? family[1] : categoryIcon(detected.category);
  }
  return categoryIcon(category);
}

/** What to draw for a saved item: the user's pick wins, then the suggestion from its name and category. */
export function itemIcon(item: { icon: string | null; name: string; category: string | null }): string {
  return item.icon ?? suggestIcon(item.name, item.category);
}
