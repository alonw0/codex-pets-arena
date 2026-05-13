import { AuthForm } from "@/components/AuthForm";
import { BrandLogo } from "@/components/BrandLogo";

export default function AuthPage() {
  return (
    <main className="center-page">
      <BrandLogo compact />
      <AuthForm />
    </main>
  );
}
