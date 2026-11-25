
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";
import { useCart } from "@/context/CartContext";

const MAX_COMPARE = 4;

const FEATURE_LABELS: Record<string, string> = {
  comfort: "Comfort",
  cushioning: "Cushioning",
  durability: "Durability",
  breathability: "Breathability",
  flexibility: "Flexibility",
  grip: "Traction & Grip",
  style: "Style & Aesthetics",
  valueForMoney: "Value for Money",
};

export default function ComparePage() {
  const router = useRouter();
  const { addToCart } = useCart();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Track the latest comparison request to prevent stale responses.
  const comparisonRequestId = useRef(0);

  // Search & add shoe modal state
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [catalogShoes, setCatalogShoes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchingCatalog, setIsSearchingCatalog] = useState<boolean>(false);
  const [catalogError, setCatalogError] = useState<string>("");

  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" | "info" }>({
    show: false,
    message: "",
    type: "info",
  });

  // Read URL query parameter `ids`
  useEffect(() => {
    if (!router.isReady) return;

    const { ids } = router.query;

    if (ids && typeof ids === "string") {
      const parsed = [
        ...new Set(
          ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      ].slice(0, MAX_COMPARE);

      if (parsed.length > 0) {
        setSelectedIds(parsed);
      } else {
        setSelectedIds([]);
      }
    } else if (!ids) {
      setSelectedIds([]);
    }
  }, [router.isReady, router.query]);

  // Fetch comparison data whenever selectedIds changes (when at least 2 IDs)
  const fetchComparison = useCallback(async (idsToCompare: string[]) => {
    const requestId = ++comparisonRequestId.current;

    if (idsToCompare.length < 2) {
      setComparisonData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: idsToCompare }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to compare products.");
      }

      // Ignore responses from older requests.
      if (requestId !== comparisonRequestId.current) return;

      setComparisonData(json.data);
    } catch (err: any) {
      // Ignore errors from older requests.
      if (requestId !== comparisonRequestId.current) return;

      console.error(err);
      setComparisonData(null);

      setToast({
        show: true,
        message: err.message || "Failed to load comparison.",
        type: "error",
      });
    } finally {
      // Only the latest request can change the loading state.
      if (requestId === comparisonRequestId.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedIds.length >= 2) {
      fetchComparison(selectedIds);
    } else {
      comparisonRequestId.current += 1;
      setComparisonData(null);
      setIsLoading(false);
    }

    return () => {
      comparisonRequestId.current += 1;
    };
  }, [selectedIds, fetchComparison]);

  // Load catalog for search modal
  const openSearchModal = async () => {
    setShowSearchModal(true);

    if (catalogShoes.length === 0) {
      setIsSearchingCatalog(true);
      setCatalogError("");

      try {
        const res = await fetch("/api/products/public?limit=30");

        if (!res.ok) {
          throw new Error("Failed to load catalog products.");
        }

        const json = await res.json();

        if (!json.success || !Array.isArray(json.products)) {
          throw new Error("Invalid product catalog response.");
        }

        setCatalogShoes(json.products);
      } catch (err) {
        console.error("Failed to load catalog products:", err);

        setCatalogError("Unable to load shoes. Please try again.");
      } finally {
        setIsSearchingCatalog(false);
      }
    }
  };

  const addShoeToCompare = (shoe: any) => {
    const id = String(shoe._id);

    if (selectedIds.includes(id)) {
      setToast({ show: true, message: "Shoe is already in comparison.", type: "info" });
      return;
    }

    if (selectedIds.length >= MAX_COMPARE) {
      setToast({ show: true, message: `You can compare up to ${MAX_COMPARE} shoes.`, type: "error" });
      return;
    }

    const next = [...selectedIds, id];

    setSelectedIds(next);
    setShowSearchModal(false);

    router.replace(`/compare?ids=${next.join(",")}`, undefined, { shallow: true });
  };

  const removeShoe = (idToRemove: string) => {
    const next = selectedIds.filter((id) => id !== idToRemove);

    setSelectedIds(next);

    if (next.length > 0) {
      router.replace(`/compare?ids=${next.join(",")}`, undefined, { shallow: true });
    } else {
      router.replace("/compare", undefined, { shallow: true });
    }
  };

  const formatPrice = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return catalogShoes;

    const q = searchQuery.toLowerCase();

    return catalogShoes.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.brand?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
    );
  }, [catalogShoes, searchQuery]);

  const products: any[] = comparisonData?.products || [];

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans">
      <Head>
        <title>Compare Shoes | KickStreet</title>
        <meta
          name="description"
          content="Compare up to 4 sneakers side by side on specs, comfort, cushioning, durability, and price on KickStreet."
        />
      </Head>

      <Navbar />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
        {/* HEADER */}
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-xs font-black uppercase tracking-wider mb-2">
              Product Analysis
            </div>

            <h1 className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter text-black">
              Compare Sneakers
            </h1>

            <p className="mt-1 text-sm text-gray-600">
              Select 2 to 4 shoes to compare performance scores, physical specs, and pricing side by side.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {selectedIds.length < MAX_COMPARE && (
              <button
                type="button"
                onClick={openSearchModal}
                className="px-5 py-3 rounded-xl bg-black text-white font-black text-xs uppercase italic tracking-wider hover:bg-orange-600 transition shadow"
              >
                + Add Shoe ({selectedIds.length}/{MAX_COMPARE})
              </button>
            )}

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  router.replace("/compare", undefined, { shallow: true });
                }}
                className="px-4 py-3 rounded-xl border border-gray-300 font-bold text-xs uppercase text-gray-600 hover:border-black transition"
              >
                Clear All
              </button>
            )}
          </div>
        </section>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="h-[400px] flex flex-col items-center justify-center p-8 bg-gray-50 border border-gray-100 rounded-2xl">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>

            <p className="text-sm font-black uppercase italic tracking-wider text-gray-800">
              Generating comparison matrix...
            </p>
          </div>
        )}

        {/* EMPTY STATE */}
        {!isLoading && selectedIds.length < 2 && (
          <div className="p-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl my-8">
            <svg
              className="w-16 h-16 text-gray-300 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>

            <h3 className="text-xl font-black uppercase italic tracking-tight text-gray-900">
              {selectedIds.length === 1 ? "Select 1 More Shoe" : "Select at least 2 Shoes to Compare"}
            </h3>

            <p className="text-xs text-gray-500 max-w-md mx-auto mt-2">
              Choose from KickStreet&apos;s active catalog or use the AI Matchmaker to discover pairs tailored to your
              preferences.
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={openSearchModal}
                className="px-6 py-3 rounded-xl bg-black text-white font-black text-xs uppercase italic tracking-wider hover:bg-orange-600 transition"
              >
                Browse & Add Shoes
              </button>

              <Link
                href="/recommendations"
                className="px-6 py-3 rounded-xl border border-gray-300 font-bold text-xs uppercase text-gray-800 hover:border-black transition"
              >
                Use AI Matchmaker
              </Link>
            </div>
          </div>
        )}

        {/* COMPARISON MATRIX TABLE */}
        {!isLoading && products.length >= 2 && (
          <div className="space-y-8">
            {/* PRICE SUMMARY STATS */}
            {comparisonData?.priceAnalysis && (
              <div className="bg-gray-900 text-white p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 block">
                    Price Analysis
                  </span>

                  <div className="text-sm font-semibold mt-0.5">
                    Lowest: <strong className="text-white">{formatPrice(comparisonData.priceAnalysis.lowestPrice)}</strong> •
                    Highest: <strong className="text-white">{formatPrice(comparisonData.priceAnalysis.highestPrice)}</strong>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">Price Difference</span>

                  <span className="text-base font-black text-orange-400">
                    {formatPrice(comparisonData.priceAnalysis.priceDifference)}
                  </span>
                </div>
              </div>
            )}

            {/* COMPARISON GRID CONTAINER */}
            <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
              <table className="w-full text-left border-collapse min-w-[700px]">
                {/* PRODUCT CARDS HEADER ROW */}
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="p-4 sm:p-6 w-48 text-xs font-black uppercase tracking-wider text-gray-400 align-top">
                      Sneaker
                    </th>

                    {products.map((p) => {
                      const imageSrc = (Array.isArray(p.images) && p.images[0]) || "/placeholder.png";

                      return (
                        <th key={p._id} className="p-4 sm:p-6 text-left align-top min-w-[200px]">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => removeShoe(p._id)}
                              className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-gray-200 hover:bg-red-500 hover:text-white text-gray-600 font-bold text-xs flex items-center justify-center transition"
                              title="Remove shoe"
                            >
                              ✕
                            </button>

                            <div className="relative w-full h-36 bg-white rounded-xl overflow-hidden border border-gray-200 mb-3 flex items-center justify-center">
                              <Image
                                src={typeof imageSrc === "string" ? imageSrc : "/placeholder.png"}
                                alt={p.name}
                                fill
                                sizes="200px"
                                className="object-contain p-2"
                              />
                            </div>

                            <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">
                              {p.brand}
                            </span>

                            <h3 className="text-sm font-black uppercase italic tracking-tight text-gray-900 leading-snug">
                              <Link href={`/products/${p._id}`} className="hover:text-orange-600 transition">
                                {p.name}
                              </Link>
                            </h3>

                            <div className="text-base font-black text-gray-900 mt-1">
                              {formatPrice(p.effectivePrice || p.price)}
                            </div>

                            <Link
                              href={`/products/${p._id}`}
                              className="mt-3 block w-full text-center py-2 rounded-xl bg-black text-white font-black text-xs uppercase tracking-wider hover:bg-orange-600 transition"
                            >
                              View / Buy
                            </Link>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 text-xs">
                  {/* CATEGORY & GENDER */}
                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Category</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 font-bold text-gray-800">
                        {p.subCategory || p.category}
                      </td>
                    ))}
                  </tr>

                  {/* SIZES AVAILABLE */}
                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Sizes</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-700 font-medium">
                        {Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes.join(", ") : "Standard"}
                      </td>
                    ))}
                  </tr>

                  {/* COLORS */}
                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Colors</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-700 capitalize font-medium">
                        {Array.isArray(p.colors) && p.colors.length > 0 ? p.colors.join(", ") : "Multi"}
                      </td>
                    ))}
                  </tr>

                  {/* SECTION HEADER: FEATURE SCORES */}
                  <tr className="bg-gray-100/70">
                    <td colSpan={products.length + 1} className="p-3 text-[11px] font-black uppercase tracking-widest text-black">
                      Performance &amp; Feature Scores (Scale 1–10)
                    </td>
                  </tr>

                  {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                    <tr key={key}>
                      <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">{label}</td>

                      {products.map((p) => {
                        const score = p.recommendationFeatures?.[key] ?? 7;

                        return (
                          <td key={p._id} className="p-4 align-middle">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-gray-900 w-5">{score}</span>

                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[100px]">
                                <div
                                  className={`h-full rounded-full ${
                                    score >= 8 ? "bg-orange-600" : score >= 6 ? "bg-gray-800" : "bg-gray-400"
                                  }`}
                                  style={{ width: `${(score / 10) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* SECTION HEADER: PHYSICAL SPECIFICATIONS */}
                  <tr className="bg-gray-100/70">
                    <td colSpan={products.length + 1} className="p-3 text-[11px] font-black uppercase tracking-widest text-black">
                      Physical Specifications
                    </td>
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Upper Material</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-800 capitalize font-medium">
                        {p.specifications?.upperMaterial || "Mesh / Leather"}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Sole Material</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-800 capitalize font-medium">
                        {p.specifications?.soleMaterial || "Rubber"}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Closure</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-800 capitalize font-medium">
                        {p.specifications?.closureType || "Lace-Up"}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Waterproof</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 font-bold">
                        {p.specifications?.waterproof ? (
                          <span className="text-green-600">✓ Yes</span>
                        ) : (
                          <span className="text-gray-400">✗ Water Resistant Only</span>
                        )}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-gray-500 bg-gray-50">Breathable</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 font-bold">
                        {p.specifications?.breathable !== false ? (
                          <span className="text-green-600">✓ Yes</span>
                        ) : (
                          <span className="text-gray-400">Standard</span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* PROS & CONS */}
                  <tr className="bg-gray-100/70">
                    <td colSpan={products.length + 1} className="p-3 text-[11px] font-black uppercase tracking-widest text-black">
                      Pros &amp; Considerations
                    </td>
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-green-700 bg-gray-50">Advantages</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-700 font-medium">
                        <ul className="list-disc pl-4 space-y-1">
                          {(p.pros && p.pros.length > 0 ? p.pros : ["Premium design and durable materials"]).map(
                            (pro: string, idx: number) => (
                              <li key={idx}>{pro}</li>
                            )
                          )}
                        </ul>
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-black uppercase tracking-wider text-amber-700 bg-gray-50">Limitations</td>

                    {products.map((p) => (
                      <td key={p._id} className="p-4 text-gray-700 font-medium">
                        <ul className="list-disc pl-4 space-y-1">
                          {(p.cons && p.cons.length > 0
                            ? p.cons
                            : ["Requires proper maintenance to keep fresh"]
                          ).map((con: string, idx: number) => (
                            <li key={idx}>{con}</li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEARCH & ADD SHOE MODAL */}
        {showSearchModal && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-black italic uppercase text-sm tracking-wider text-black">
                  Add Shoe to Comparison
                </h3>

                <button
                  type="button"
                  onClick={() => setShowSearchModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>

              {/* SEARCH INPUT */}
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <input
                  type="text"
                  placeholder="Search by name, brand, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-black"
                />
              </div>

              {/* PRODUCT LIST */}
              <div className="p-4 overflow-y-auto flex-1 space-y-2">
                {isSearchingCatalog ? (
                  <div className="py-8 text-center text-xs text-gray-500 font-bold uppercase animate-pulse">
                    Loading shoes...
                  </div>
                ) : catalogError ? (
                  <div className="py-8 text-center text-xs text-red-600 font-medium">
                    {catalogError}
                  </div>
                ) : filteredCatalog.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-500 font-medium">
                    No shoes match your search.
                  </div>
                ) : (
                  filteredCatalog.map((shoe) => {
                    const isAlreadySelected = selectedIds.includes(String(shoe._id));
                    const img = (Array.isArray(shoe.images) && shoe.images[0]) || "/placeholder.png";

                    return (
                      <div
                        key={shoe._id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition ${
                          isAlreadySelected
                            ? "bg-gray-100 border-gray-200 opacity-60"
                            : "bg-white border-gray-200 hover:border-black"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden relative shrink-0">
                            <Image
                              src={typeof img === "string" ? img : "/placeholder.png"}
                              alt={shoe.name}
                              fill
                              sizes="48px"
                              className="object-contain p-1"
                            />
                          </div>

                          <div>
                            <span className="text-[9px] font-black uppercase text-gray-500 block">
                              {shoe.brand} • {shoe.category}
                            </span>

                            <h4 className="text-xs font-black uppercase text-gray-900 line-clamp-1">{shoe.name}</h4>

                            <span className="text-xs font-black text-gray-900">{formatPrice(shoe.price)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isAlreadySelected}
                          onClick={() => addShoeToCompare(shoe)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${
                            isAlreadySelected
                              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                              : "bg-black text-white hover:bg-orange-600"
                          }`}
                        >
                          {isAlreadySelected ? "Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
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
