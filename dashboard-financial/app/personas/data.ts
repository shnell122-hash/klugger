// Klugger — datos mock del catálogo de compra (/personas). No hay backend de propiedades
// todavía: esto vive aquí para que la landing y la página de detalle lean el mismo dataset.
import type { Prop } from "@/components/klugger/organisms";
import { UI } from "@/components/klugger/icons";

export type ListedProp = Prop & { descripcion: string; mapX: number; mapY: number };

export const PROPS: ListedProp[] = [
  {
    id: "a", titulo: "Departamento en Condesa", zona: "Condesa", precio: 6_450_000, rec: 2, m2: 82,
    verificado: true, plus: 6.4, tipo: "Departamento", usoSuelo: "Habitacional",
    tint: ["#B4D94B", "#7CD6FF", "#DCCAB4"], mapX: 28, mapY: 40,
    descripcion: "Departamento luminoso a dos cuadras del parque España, edificio de 4 niveles con elevador y bodega.",
  },
  {
    id: "b", titulo: "Casa en Coyoacán", zona: "Coyoacán", precio: 8_900_000, rec: 3, m2: 140,
    verificado: true, nuevo: true, tipo: "Casa", usoSuelo: "Habitacional",
    tint: ["#DCCAB4", "#C9B496", "#566757"], mapX: 44, mapY: 62,
    descripcion: "Casa de estilo colonial con jardín propio, cerca del centro histórico de Coyoacán y del mercado.",
  },
  {
    id: "c", titulo: "Loft en Roma Norte", zona: "Roma", precio: 5_200_000, rec: 1, m2: 58,
    verificado: false, plus: 4.1, tipo: "Departamento", usoSuelo: "Mixto",
    tint: ["#57C6E8", "#B4D94B", "#FAF0DA"], mapX: 52, mapY: 38,
    descripcion: "Loft de un ambiente en edificio art-decó, ideal para vivir o rentar por temporada — uso mixto.",
  },
  {
    id: "d", titulo: "PH en Polanco", zona: "Polanco", precio: 7_100_000, rec: 2, m2: 96,
    verificado: true, tipo: "Departamento", usoSuelo: "Habitacional",
    tint: ["#918771", "#DCCAB4", "#7CD6FF"], mapX: 34, mapY: 20,
    descripcion: "Penthouse con terraza privada, a pasos de Av. Presidente Masaryk y del bosque de Chapultepec.",
  },
  {
    id: "e", titulo: "Terreno en Xochimilco", zona: "Xochimilco", precio: 3_200_000, rec: 0, m2: 300,
    verificado: true, tipo: "Terreno", usoSuelo: "Mixto",
    tint: ["#335E2C", "#57C6E8", "#B4D94B"], mapX: 62, mapY: 82,
    descripcion: "Terreno plano cerca de los canales, con factibilidad de agua y luz — bueno para autoconstrucción.",
  },
  {
    id: "f", titulo: "Oficina en Juárez", zona: "Juárez", precio: 12_500_000, rec: 0, m2: 210,
    verificado: true, plus: 5.2, tipo: "Oficina", usoSuelo: "Comercial",
    tint: ["#7CD6FF", "#918771", "#343631"], mapX: 46, mapY: 30,
    descripcion: "Piso completo de oficinas en corredor Reforma-Juárez, listo para operar, con 6 cajones de estacionamiento.",
  },
];

export const ZONAS = [
  { icon: UI.Building2, name: "Condesa", dato: "▲ 6.4% plusvalía · $58k/m²" },
  { icon: UI.Trees, name: "Coyoacán", dato: "Parques · casas coloniales" },
  { icon: UI.Waves, name: "Xochimilco", dato: "Chinampas · canales" },
  { icon: UI.Store, name: "Roma", dato: "Comercio · art-decó" },
  { icon: UI.MapPin, name: "Polanco", dato: "Premium · torres" },
  { icon: UI.Home, name: "San Ángel", dato: "Empedrado · plusvalía alta" },
];
