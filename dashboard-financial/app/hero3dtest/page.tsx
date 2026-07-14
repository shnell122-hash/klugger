"use client";
// Página temporal de verificación del hero 3D (borrar tras QA).
import "../style/klugger.css";
import dynamic from "next/dynamic";
const HeroWorld3D = dynamic(() => import("@/components/klugger/HeroWorld3D").then((m) => m.HeroWorld3D), { ssr: false });

export default function Hero3DTest() {
  return (
    <div className="klugger-scope" data-theme="consumer" style={{ padding: 0 }}>
      <div style={{ height: "100vh" }}>
        <HeroWorld3D />
      </div>
    </div>
  );
}
