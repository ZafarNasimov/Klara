import type { Metadata } from "next";
import { CaseBoard } from "@/components/admin/case-board";

export const metadata: Metadata = { title: "Vorgänge" };

export default function AdminHome() {
  return <CaseBoard />;
}
