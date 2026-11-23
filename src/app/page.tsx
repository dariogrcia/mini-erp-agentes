import { redirect } from "next/navigation";

// D7: the root goes to the dashboard (proxy.ts sends anonymous users to /login first).
export default function Home() {
  redirect("/dashboard");
}
