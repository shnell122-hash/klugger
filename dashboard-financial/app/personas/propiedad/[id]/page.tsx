import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PROPS } from "../../data";
import { PropertyDetailClient } from "./PropertyDetailClient";

export function generateStaticParams() {
  return PROPS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const prop = PROPS.find((p) => p.id === id);
  if (!prop) return { title: "Propiedad no encontrada · Klugger" };
  return {
    title: `${prop.titulo} · Klugger`,
    description: `${prop.titulo} en ${prop.zona} — ${prop.descripcion}`,
  };
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prop = PROPS.find((p) => p.id === id);
  if (!prop) notFound();
  return <PropertyDetailClient prop={prop} />;
}
