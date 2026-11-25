
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

/* =========================================
   TYPES
========================================= */

export interface CartItem {
  _id: string;
  name: string;
  price: number;
  image: string;
  size: string;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];

  addToCart: (
    item: CartItem
  ) => void;

  removeFromCart: (
    id: string,
    size: string
  ) => void;

  /*
   * Absolute quantity update.
   *
   * updateQuantity(id, size, 3)
   * means set quantity to 3.
   */
  updateQuantity: (
    id: string,
    size: string,
    quantity: number
  ) => void;

  clearCart: () => void;

  cartTotal: number;
  cartCount: number;

  isInitialized: boolean;
}

/* =========================================
   CONSTANTS
========================================= */

const CART_STORAGE_KEY =
  "kickstreet_cart";

const MAX_CART_LINES = 50;
const MAX_ITEM_QUANTITY = 20;
const MAX_TOTAL_QUANTITY = 100;

const MAX_NAME_LENGTH = 200;
const MAX_SIZE_LENGTH = 30;
const MAX_IMAGE_LENGTH = 2048;
const MAX_PRICE = 10000000;

const OBJECT_ID_REGEX =
  /^[a-fA-F0-9]{24}$/;

/* =========================================
   CONTEXT
========================================= */

const CartContext = createContext<
  CartContextType | undefined
>(undefined);

/* =========================================
   VALIDATION HELPERS
========================================= */

function normalizeId(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    !OBJECT_ID_REGEX.test(value)
  ) {
    return null;
  }

  return value.toLowerCase();
}

function normalizeSize(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const size = value.trim();

  if (
    !size ||
    size.length > MAX_SIZE_LENGTH
  ) {
    return null;
  }

  return size;
}

function normalizeImage(
  value: unknown
): string {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  const image = value.trim();

  if (
    !image ||
    image.length > MAX_IMAGE_LENGTH
  ) {
    return "";
  }

  if (
    image.startsWith("/") &&
    !image.startsWith("//")
  ) {
    return image;
  }

  try {
    const url = new URL(image);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return image;
    }
  } catch {
    return "";
  }

  return "";
}

/* =========================================
   NORMALIZE CART ITEM
========================================= */

function normalizeCartItem(
  value: unknown
): CartItem | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const item =
    value as Record<string, unknown>;

  const id =
    normalizeId(item._id);

  const size =
    normalizeSize(item.size);

  if (
    !id ||
    !size
  ) {
    return null;
  }

  if (
    typeof item.name !== "string"
  ) {
    return null;
  }

  const name =
    item.name.trim();

  if (
    !name ||
    name.length > MAX_NAME_LENGTH
  ) {
    return null;
  }

  if (
    typeof item.price !== "number" ||
    !Number.isFinite(item.price) ||
    item.price <= 0 ||
    item.price > MAX_PRICE
  ) {
    return null;
  }

  if (
    typeof item.quantity !== "number" ||
    !Number.isSafeInteger(
      item.quantity
    ) ||
    item.quantity < 1
  ) {
    return null;
  }

  return {
    _id: id,
    name,
    price: item.price,
    image: normalizeImage(
      item.image
    ),
    size,
    quantity: Math.min(
      item.quantity,
      MAX_ITEM_QUANTITY
    ),
  };
}

/* =========================================
   SANITIZE CART
========================================= */

function sanitizeCart(
  input: unknown
): CartItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const grouped =
    new Map<string, CartItem>();

  let totalQuantity = 0;

  for (
    const rawItem of input
  ) {
    const item =
      normalizeCartItem(
        rawItem
      );

    if (!item) {
      continue;
    }

    const key =
      `${item._id}:${item.size}`;

    const existing =
      grouped.get(key);

    if (
      !existing &&
      grouped.size >=
        MAX_CART_LINES
    ) {
      continue;
    }

    const remainingPerLine =
      MAX_ITEM_QUANTITY -
      (existing?.quantity ?? 0);

    const remainingTotal =
      MAX_TOTAL_QUANTITY -
      totalQuantity;

    const allowed =
      Math.min(
        item.quantity,
        remainingPerLine,
        remainingTotal
      );

    if (
      allowed <= 0
    ) {
      continue;
    }

    if (existing) {
      grouped.set(
        key,
        {
          ...existing,
          quantity:
            existing.quantity +
            allowed,
        }
      );
    } else {
      grouped.set(
        key,
        {
          ...item,
          quantity: allowed,
        }
      );
    }

    totalQuantity += allowed;

    if (
      totalQuantity >=
      MAX_TOTAL_QUANTITY
    ) {
      break;
    }
  }

  return Array.from(
    grouped.values()
  );
}

/* =========================================
   CART PROVIDER
========================================= */

export const CartProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [
    isInitialized,
    setIsInitialized,
  ] = useState(false);

  const initializedRef =
    useRef(false);

  /* =====================================
     INITIALIZE CART
  ===================================== */

  useEffect(() => {
    try {
      const stored =
        window.localStorage.getItem(
          CART_STORAGE_KEY
        );

      if (stored) {
        const parsed: unknown =
          JSON.parse(stored);

        setCart(
          sanitizeCart(parsed)
        );
      }
    } catch (error: unknown) {
      console.warn(
        "CART_LOAD_ERROR:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      try {
        window.localStorage.removeItem(
          CART_STORAGE_KEY
        );
      } catch {
        // Storage may be unavailable.
      }
    } finally {
      initializedRef.current = true;
      setIsInitialized(true);
    }
  }, []);

  /* =====================================
     SAVE CART
  ===================================== */

  useEffect(() => {
    if (
      !isInitialized
    ) {
      return;
    }

    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
      );
    } catch (error: unknown) {
      console.warn(
        "CART_SAVE_ERROR:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );
    }
  }, [
    cart,
    isInitialized,
  ]);

  /* =====================================
     CROSS-TAB SYNCHRONIZATION
  ===================================== */

  useEffect(() => {
    const handleStorage = (
      event: StorageEvent
    ) => {
      if (
        event.storageArea !==
        window.localStorage
      ) {
        return;
      }

      if (
        event.key !==
          CART_STORAGE_KEY &&
        event.key !== null
      ) {
        return;
      }

      if (
        event.newValue === null
      ) {
        setCart([]);
        return;
      }

      try {
        const parsed: unknown =
          JSON.parse(
            event.newValue
          );

        setCart(
          sanitizeCart(parsed)
        );
      } catch {
        setCart([]);
      }
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  /* =====================================
     ADD TO CART
  ===================================== */

  const addToCart = useCallback(
    (
      newItem: CartItem
    ) => {
      if (
        !initializedRef.current
      ) {
        return;
      }

      const normalized =
        normalizeCartItem(
          newItem
        );

      if (!normalized) {
        console.warn(
          "CART_ADD_INVALID_ITEM"
        );
        return;
      }

      setCart((previous) => {
        const existing =
          previous.find(
            (item) =>
              item._id ===
                normalized._id &&
              item.size ===
                normalized.size
          );

        const totalQuantity =
          previous.reduce(
            (sum, item) =>
              sum +
              item.quantity,
            0
          );

        const remainingTotal =
          MAX_TOTAL_QUANTITY -
          totalQuantity;

        if (
          remainingTotal <= 0
        ) {
          return previous;
        }

        if (existing) {
          const remainingPerLine =
            MAX_ITEM_QUANTITY -
            existing.quantity;

          const allowedQuantity =
            Math.min(
              normalized.quantity,
              remainingPerLine,
              remainingTotal
            );

          if (
            allowedQuantity <= 0
          ) {
            return previous;
          }

          return previous.map(
            (item) =>
              item._id ===
                normalized._id &&
              item.size ===
                normalized.size
                ? {
                    ...item,
                    quantity:
                      item.quantity +
                      allowedQuantity,
                  }
                : item
          );
        }

        if (
          previous.length >=
          MAX_CART_LINES
        ) {
          return previous;
        }

        const allowedQuantity =
          Math.min(
            normalized.quantity,
            MAX_ITEM_QUANTITY,
            remainingTotal
          );

        if (
          allowedQuantity <= 0
        ) {
          return previous;
        }

        return [
          ...previous,
          {
            ...normalized,
            quantity: allowedQuantity,
          },
        ];
      });
    },
    []
  );

  /* =====================================
     UPDATE QUANTITY
  ===================================== */

  const updateQuantity = useCallback(
    (
      id: string,
      size: string,
      quantity: number
    ) => {
      if (
        !initializedRef.current ||
        !Number.isSafeInteger(
          quantity
        )
      ) {
        return;
      }

      const normalizedId =
        normalizeId(id);

      const normalizedSize =
        normalizeSize(size);

      if (
        !normalizedId ||
        !normalizedSize
      ) {
        return;
      }

      setCart((previous) => {
        const existing =
          previous.find(
            (item) =>
              item._id ===
                normalizedId &&
              item.size ===
                normalizedSize
          );

        if (!existing) {
          return previous;
        }

        const requestedQuantity =
          Math.max(
            1,
            Math.min(
              quantity,
              MAX_ITEM_QUANTITY
            )
          );

        const otherQuantity =
          previous.reduce(
            (sum, item) =>
              sum +
              (
                item._id ===
                  normalizedId &&
                item.size ===
                  normalizedSize
                  ? 0
                  : item.quantity
              ),
            0
          );

        const available =
          MAX_TOTAL_QUANTITY -
          otherQuantity;

        const finalQuantity =
          Math.min(
            requestedQuantity,
            available
          );

        if (
          finalQuantity < 1 ||
          finalQuantity ===
            existing.quantity
        ) {
          return previous;
        }

        return previous.map(
          (item) =>
            item._id ===
              normalizedId &&
            item.size ===
              normalizedSize
              ? {
                  ...item,
                  quantity:
                    finalQuantity,
                }
              : item
        );
      });
    },
    []
  );

  /* =====================================
     REMOVE ITEM
  ===================================== */

  const removeFromCart = useCallback(
    (
      id: string,
      size: string
    ) => {
      if (
        !initializedRef.current
      ) {
        return;
      }

      const normalizedId =
        normalizeId(id);

      const normalizedSize =
        normalizeSize(size);

      if (
        !normalizedId ||
        !normalizedSize
      ) {
        return;
      }

      setCart((previous) =>
        previous.filter(
          (item) =>
            !(
              item._id ===
                normalizedId &&
              item.size ===
                normalizedSize
            )
        )
      );
    },
    []
  );

  /* =====================================
     CLEAR CART
  ===================================== */

  const clearCart = useCallback(
    () => {
      if (
        !initializedRef.current
      ) {
        return;
      }

      setCart([]);
    },
    []
  );

  /* =====================================
     CART TOTAL
  ===================================== */

  const cartTotal =
    useMemo(
      () =>
        cart.reduce(
          (total, item) =>
            total +
            item.price *
              item.quantity,
          0
        ),
      [cart]
    );

  /* =====================================
     CART COUNT
  ===================================== */

  const cartCount =
    useMemo(
      () =>
        cart.reduce(
          (total, item) =>
            total +
            item.quantity,
          0
        ),
      [cart]
    );

  /* =====================================
     CONTEXT VALUE
  ===================================== */

  const contextValue =
    useMemo<CartContextType>(
      () => ({
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
        isInitialized,
      }),
      [
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
        isInitialized,
      ]
    );

  return (
    <CartContext.Provider
      value={
        contextValue
      }
    >
      {children}
    </CartContext.Provider>
  );
};

/* =========================================
   CUSTOM HOOK
========================================= */

export const useCart = () => {
  const context =
    useContext(
      CartContext
    );

  if (!context) {
    throw new Error(
      "useCart must be used within a CartProvider"
    );
  }

  return context;
};
