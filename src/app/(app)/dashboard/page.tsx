import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel",
};

// Placeholder so the post-login redirect lands on a real route. Task 8 replaces it.
export default function DashboardPage() {
  return <h1 className="text-2xl font-semibold tracking-tight text-ink">Panel</h1>;
}
