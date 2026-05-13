import { EarthZoomSearch } from "@/components/earth-zoom-search/EarthZoomSearch";

export const metadata = {
  title: "Recherche de lieu · JARVIS",
};

export default function RechercheLieuPage() {
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden">
      <EarthZoomSearch />
    </main>
  );
}
