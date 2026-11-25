import { useState, useEffect, type FormEvent } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";
import { useCart } from "@/context/CartContext";

const GENDERS = [
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
  { value: "unisex", label: "Unisex" },
];

const CATEGORIES = [
  { value: "sneakers", label: "Sneakers" },
  { value: "running", label: "Running" },
  { value: "walking", label: "Walking" },
  { value: "casual", label: "Casual" },
  { value: "sports", label: "Sports" },
  { value: "training", label: "Gym & Training" },
  { value: "formal", label: "Formal" },
  { value: "hiking", label: "Hiking & Outdoor" },
];

const POPULAR_BRANDS = [
  "Nike",
  "Jordan",
  "Adidas",
  "Puma",
  "New Balance",
  "Converse",
  "Vans",
  "Reebok",
  "Asics",
];

const POPULAR_COLORS = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Grey",
  "Green",
  "Beige",
  "Brown",
];

const USE_CASES = [
  { value: "daily-wear", label: "Daily Wear" },
  { value: "running", label: "Running" },
  { value: "gym", label: "Gym & Workout" },
  { value: "casual", label: "Streetwear & Casual" },
  { value: "travel", label: "Travel & Walking" },
  { value: "office", label: "Work & Office" },
];

const FEATURE_PRIORITIES = [
  { key: "comfort", label: "All-Day Comfort" },
  { key: "cushioning", label: "Impact Cushioning" },
  { key: "durability", label: "Long-term Durability" },
  { key: "breathability", label: "Air Breathability" },
  { key: "grip", label: "Traction & Grip" },
  { key: "style", label: "Aesthetic & Style" },
  { key: "valueForMoney", label: "Value for Money" },
] as const;

export default function RecommendationsPage() {
  const router = useRouter();
  const { addToCart } = useCart();

  const [gender, setGender] = useState<string>("men");
  const [category, setCategory] = useState<string>("sneakers");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("15000");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>(["daily-wear"]);
  const [priorities, setPriorities] = useState<Record<string, number>>({
    comfort: 8,
    cushioning: 7,
    durability: 8,
    breathability: 7,
    grip: 7,
    style: 9,
    valueForMoney: 8,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [results, setResults] = useState<any[]>([]);
  const [aiExplanation, setAiExplanation] = useState<any>(null);
  const [stats, setStats] = useState<{ totalCandidates: number; totalMatches: number } | null>(null);

  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" | "info" }>({
    show: false,
    message: "",
    type: "info",
  });

  // Load saved user preferences if authenticated
  useEffect(() => {
    async function loadUserPrefs() {
      try {
        const res = await fetch("/api/user/preferences");
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.preferences) {
            const p = json.preferences;
            if (p.gender) setGender(p.gender);
            if (p.category) setCategory(p.category);
            if (Array.isArray(p.brands) && p.brands.length > 0) setSelectedBrands(p.brands);
            if (Array.isArray(p.colors) && p.colors.length > 0) setSelectedColors(p.colors);
            if (Array.isArray(p.useCases) && p.useCases.length > 0) setSelectedUseCases(p.useCases);
            if (p.maxPrice) setMaxPrice(String(p.maxPrice));
            if (p.minPrice) setMinPrice(String(p.minPrice));
            if (p.priorities && Object.keys(p.priorities).length > 0) {
              setPriorities((prev) => ({ ...prev, ...p.priorities }));
            }
          }
        }
      } catch {
        // Guest user or offline
      }
    }
    loadUserPrefs();
  }, []);

  const toggleBrand = (b: string) => {
    setSelectedBrands((prev) =>
      prev.includes(b) ? prev.filter((item) => item !== b) : [...prev, b]
    );
  };

  const toggleColor = (c: string) => {
    setSelectedColors((prev) =>
      prev.includes(c) ? prev.filter((item) => item !== c) : [...prev, c]
    );
  };

  const toggleUseCase = (u: string) => {
    setSelectedUseCases((prev) =>
      prev.includes(u) ? prev.filter((item) => item !== u) : [...prev, u]
    );
  };

  const handlePriorityChange = (key: string, val: number) => {
    setPriorities((prev) => ({ ...prev, [key]: val }));
  };

  const handleRecommend = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    setIsLoading(true);
    setHasSearched(true);

    try {
      const payload = {
        gender,
        category,
        brands: selectedBrands,
        colors: selectedColors,
        useCases: selectedUseCases,
        minPrice: minPrice ? Number(minPrice) : null,
        maxPrice: maxPrice ? Number(maxPrice) : null,
        priorities,
      };

      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to retrieve recommendations.");
      }

      setResults(json.data.recommendations || []);
      setAiExplanation(json.data.aiExplanation || null);
      setStats({
        totalCandidates: json.data.totalCandidates ?? 0,
        totalMatches: json.data.totalMatches ?? 0,
      });

      // Save preferences in background if user is logged in
      fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});

      if (json.data.recommendations?.length === 0) {
        setToast({
          show: true,
          message: "No exact matches found. Try broadening your budget or category.",
          type: "info",
        });
      } else {
        setToast({
          show: true,
          message: `Found ${json.data.recommendations.length} curated recommendations!`,
          type: "success",
        });
      }
    } catch (err: any) {
      console.error(err);
      setToast({
        show: true,
        message: err.message || "An error occurred while finding matches.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  const compareAllUrl = `/compare?ids=${results.map((r) => r.shoe._id).join(",")}`;

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans">
      <Head>
        <title>AI Shoe Recommendations | KickStreet</title>
        <meta
          name="description"
          content="Get personalized sneaker recommendations grounded in KickStreet's catalog and powered by SoleMatch AI."
        />
      </Head>

      <Navbar />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
        {/* HEADER SECTION */}
        <section className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-xs font-black uppercase tracking-wider mb-3">
            <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse"></span>
            SoleMatch AI Engine
          </div>
          <h1 className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter text-black">
            AI Sneaker Matchmaker
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-2xl font-medium">
            Tell us your style, comfort priorities, and budget. Our content-based algorithm ranks the best pairs in our
            catalog, with verified AI insights powered by Google Gemini.
          </p>
        </section>

        {/* TWO-COLUMN WORKFLOW: PREFERENCES & RESULTS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* LEFT: PREFERENCE CONTROLS */}
          <div className="lg:col-span-5 bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-8 h-fit shadow-sm">
            <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-900 mb-6 flex items-center justify-between">
              <span>Your Preferences</span>
              <span className="text-[10px] font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded">Real-Time</span>
            </h2>

            <form onSubmit={handleRecommend} className="space-y-6">
              {/* GENDER */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Gender
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setGender(g.value)}
                      className={`py-2 text-xs font-black uppercase rounded-xl border transition ${
                        gender === g.value
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CATEGORY */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Shoe Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`py-2 px-3 text-xs font-bold text-left rounded-xl border transition ${
                        category === c.value
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* BUDGET */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Price Range (INR)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Min Price</span>
                    <input
                      type="number"
                      placeholder="e.g. 2000"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Max Price</span>
                    <input
                      type="number"
                      placeholder="e.g. 15000"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              </div>

              {/* BRANDS */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Preferred Brands
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_BRANDS.map((b) => {
                    const isSelected = selectedBrands.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleBrand(b)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition font-bold ${
                          isSelected
                            ? "bg-orange-600 text-white border-orange-600"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* COLORS */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Color Preference
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_COLORS.map((c) => {
                    const isSelected = selectedColors.includes(c.toLowerCase());
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleColor(c.toLowerCase())}
                        className={`text-xs px-3 py-1.5 rounded-full border transition font-bold ${
                          isSelected
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* USE CASES */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Intended Usage
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {USE_CASES.map((u) => {
                    const isSelected = selectedUseCases.includes(u.value);
                    return (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => toggleUseCase(u.value)}
                        className={`text-xs p-2 text-left rounded-xl border transition font-bold ${
                          isSelected
                            ? "bg-orange-50 border-orange-600 text-orange-700"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* FEATURE PRIORITIES */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-3">
                  Feature Priorities (Scale 1-10)
                </label>
                <div className="space-y-3 bg-white p-4 rounded-xl border border-gray-200">
                  {FEATURE_PRIORITIES.map((fp) => (
                    <div key={fp.key}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-700">{fp.label}</span>
                        <span className="text-orange-600 font-black">{priorities[fp.key] ?? 7}/10</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={priorities[fp.key] ?? 7}
                        onChange={(e) => handlePriorityChange(fp.key, Number(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-xl bg-black text-white font-black text-xs uppercase italic tracking-widest hover:bg-orange-600 transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Evaluating Catalog...</span>
                  </>
                ) : (
                  <span>Find My Top 4 Matches</span>
                )}
              </button>
            </form>
          </div>

          {/* RIGHT: RECOMMENDATIONS DISPLAY */}
          <div className="lg:col-span-7">
            {isLoading && (
              <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-gray-50 border border-gray-100 rounded-2xl">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h3 className="text-lg font-black uppercase italic tracking-tight text-gray-900">
                  SoleMatch AI is Crunching Vectors...
                </h3>
                <p className="text-xs text-gray-500 max-w-sm mt-1">
                  Filtering catalog candidates, scoring comfort vectors, and querying Gemini grounding.
                </p>
              </div>
            )}

            {!isLoading && !hasSearched && (
              <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                <svg
                  className="w-16 h-16 text-gray-300 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <h3 className="text-lg font-black uppercase italic tracking-tight text-gray-900">
                  Ready to Match
                </h3>
                <p className="text-xs text-gray-500 max-w-sm mt-1">
                  Select your preferences on the left and tap &ldquo;Find My Top 4 Matches&rdquo; to see ranked products and
                  grounded AI insights.
                </p>
              </div>
            )}

            {!isLoading && hasSearched && results.length === 0 && (
              <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-gray-50 border border-gray-200 rounded-2xl">
                <h3 className="text-lg font-black uppercase italic tracking-tight text-gray-900">
                  No Matching Shoes Found
                </h3>
                <p className="text-xs text-gray-500 max-w-sm mt-2">
                  No shoes in the catalog satisfied all your strict criteria. Try expanding your price range, toggling off
                  strict brands, or switching categories.
                </p>
              </div>
            )}

            {!isLoading && hasSearched && results.length > 0 && (
              <div className="space-y-8">
                {/* MATCH SUMMARY BAR */}
                <div className="bg-black text-white p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-md">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 block">
                      Results Overview
                    </span>
                    <h3 className="text-lg font-black italic uppercase tracking-tight">
                      Top {results.length} Curated Matches
                    </h3>
                    <p className="text-xs text-gray-400">
                      Evaluated {stats?.totalCandidates ?? results.length} candidates • {stats?.totalMatches ?? results.length} eligible
                    </p>
                  </div>
                  {results.length >= 2 && (
                    <Link
                      href={compareAllUrl}
                      className="px-4 py-2.5 rounded-xl bg-orange-600 text-white font-black text-xs uppercase italic tracking-wider hover:bg-orange-500 transition shadow"
                    >
                      Compare These {results.length} Shoes →
                    </Link>
                  )}
                </div>

                {/* GEMINI AI EXPLANATION SUMMARY */}
                {aiExplanation?.data && (
                  <div className="bg-orange-50/70 border border-orange-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-orange-600 text-white">
                        {aiExplanation.source === "gemini" ? "Google Gemini AI Grounded" : "Catalog Attribute Grounded"}
                      </span>
                      {aiExplanation.model && (
                        <span className="text-[10px] font-bold text-gray-500">Model: {aiExplanation.model}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 leading-relaxed mb-3">
                      {aiExplanation.data.summary}
                    </p>
                    {aiExplanation.data.comparison?.reason && (
                      <div className="mt-3 pt-3 border-t border-orange-200/80 text-xs text-gray-700">
                        <strong className="text-orange-950 font-black uppercase text-[10px] tracking-wider block mb-1">
                          Key Comparison Insight
                        </strong>
                        <p>{aiExplanation.data.comparison.reason}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* PRODUCT MATCHES LIST */}
                <div className="space-y-6">
                  {results.map((rec: any, idx: number) => {
                    const shoe = rec.shoe;
                    const explanation = aiExplanation?.data?.recommendations?.find(
                      (e: any) => e.productId === String(shoe._id) || e.productName === shoe.name
                    );
                    const imageSrc =
                      (Array.isArray(shoe.images) && shoe.images[0]) || "/placeholder.png";

                    return (
                      <div
                        key={shoe._id || idx}
                        className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:border-black transition flex flex-col md:flex-row gap-6 relative"
                      >
                        {/* RANK BADGE */}
                        <div className="absolute top-4 left-4 z-10 w-7 h-7 rounded-full bg-black text-white font-black text-xs flex items-center justify-center">
                          #{idx + 1}
                        </div>

                        {/* PRODUCT IMAGE */}
                        <div className="relative w-full md:w-48 h-48 bg-gray-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                          <Image
                            src={typeof imageSrc === "string" ? imageSrc : "/placeholder.png"}
                            alt={shoe.name}
                            fill
                            sizes="(max-width: 768px) 100vw, 192px"
                            className="object-contain p-2"
                          />
                        </div>

                        {/* PRODUCT INFO & AI REASONS */}
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  {shoe.brand} • {shoe.category}
                                </span>
                                <h4 className="text-lg font-black uppercase italic tracking-tight text-gray-900 leading-tight">
                                  <Link href={`/products/${shoe._id}`} className="hover:text-orange-600 transition">
                                    {shoe.name}
                                  </Link>
                                </h4>
                              </div>
                              <div className="text-right">
                                <span className="inline-block px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-black">
                                  {rec.score}% Match
                                </span>
                                <div className="text-sm font-black text-gray-900 mt-1">
                                  {formatPrice(rec.effectivePrice || shoe.price)}
                                </div>
                              </div>
                            </div>

                            {/* MATCH REASONS */}
                            {rec.matchReasons && rec.matchReasons.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {rec.matchReasons.map((reason: string, rIdx: number) => (
                                  <span
                                    key={rIdx}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700"
                                  >
                                    ✓ {reason}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* AI GROUNDED NOTE */}
                            {explanation && (
                              <div className="mt-3 text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <p className="font-medium text-gray-800 leading-snug">
                                  {explanation.whyItMatches}
                                </p>
                                {explanation.pros && explanation.pros.length > 0 && (
                                  <p className="mt-1 text-[11px] text-green-700 font-semibold">
                                    <strong>Pros:</strong> {explanation.pros.join(" • ")}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* ACTION BUTTONS */}
                          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/products/${shoe._id}`}
                                className="px-4 py-2 rounded-xl bg-black text-white font-black text-xs uppercase italic tracking-wider hover:bg-orange-600 transition"
                              >
                                View Details
                              </Link>
                              <Link
                                href={`/compare?ids=${shoe._id}`}
                                className="px-3 py-2 rounded-xl border border-gray-300 font-bold text-xs uppercase text-gray-700 hover:border-black transition"
                              >
                                + Compare
                              </Link>
                            </div>
                            <span className="text-[11px] font-semibold text-gray-500">
                              Stock: {shoe.stock > 0 ? `${shoe.stock} available` : "Out of stock"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>



      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.show}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
}
