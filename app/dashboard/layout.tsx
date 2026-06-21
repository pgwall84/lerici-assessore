import Providers from "@/app/providers";
import Navbar from "@/components/Navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">{children}</main>
      </div>
    </Providers>
  );
}
