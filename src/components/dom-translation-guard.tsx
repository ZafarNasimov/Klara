"use client";
// Browser page translation (Chrome "Translate this page", which non-German
// users get offered on this German UI) and some extensions replace text nodes
// with their own elements. React then fails to insert or remove next to a node
// that is no longer there ("Failed to execute 'insertBefore' on 'Node'") and
// the whole page breaks. Workaround from React issue #11538: skip that single
// DOM operation instead of crashing; the next render puts the screen right.
// Components that update while visible should still keep changing text inside
// their own elements (see `Waiting` on the case page), so nothing goes stale.

type Patched = typeof Node.prototype & { __klaraDomGuard?: boolean };

if (typeof window !== "undefined" && typeof Node === "function" && !(Node.prototype as Patched).__klaraDomGuard) {
  const proto = Node.prototype as Patched;
  proto.__klaraDomGuard = true;

  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn("[klara] DOM changed by the browser (page translation?); skipped removeChild", child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      console.warn("[klara] DOM changed by the browser (page translation?); appended instead of insertBefore", ref);
      return this.appendChild(node) as T;
    }
    return insertBefore.call(this, node, ref) as T;
  };
}

/** Rendered once in the root layout so the module above runs before the first update. */
export function DomTranslationGuard() {
  return null;
}
